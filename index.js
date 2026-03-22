import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.BOT_TOKEN;
const VOUCH_CHANNEL_ID = process.env.VOUCH_CHANNEL_ID || "1484165338601095320";
const DATA_FILE = path.join(__dirname, "data.json");
const PORT = process.env.PORT || 3000;

// ── Keep-alive HTTP server ────────────────────────────────────────────────────
// Keeps Replit awake and prevents the gateway connection from dropping
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`Krakens Vouch Bot is online. Status: ${client?.isReady() ? "✅ Connected" : "⏳ Connecting..."}`);
});
server.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

// ── Data helpers ──────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ orderCount: 0, pending: {} }));
  }
  const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  if (!d.pending) d.pending = {};
  return d;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function buildStars(count) {
  const n = parseInt(count, 10);
  return "⭐".repeat(n) + "✩".repeat(5 - n) + `\n**(${n}/5)**`;
}

function getPaymentEmoji(payment) {
  const p = payment.toLowerCase();
  if (p.includes("ltc") || p.includes("litecoin")) return "Ł";
  if (p.includes("btc") || p.includes("bitcoin")) return "₿";
  if (p.includes("eth") || p.includes("ethereum")) return "Ξ";
  if (p.includes("paypal")) return "🅿️";
  if (p.includes("cashapp") || p.includes("cash app")) return "💵";
  if (p.includes("venmo")) return "💸";
  return "💳";
}

function formatPayment(p) {
  return `${getPaymentEmoji(p)} ${p}`;
}

const EMBED_COLOR = 0x00b4d8;

// ── Slash command definition ──────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Close an order and send a review request to the buyer")
    .addUserOption((opt) =>
      opt.setName("buyer").setDescription("Tag the buyer").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("product").setDescription("What they purchased (e.g. 2x torpedo)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("payment").setDescription("Payment method (e.g. LTC, PayPal, BTC)").setRequired(true)
    )
    .toJSON(),
];

// ── Client setup ──────────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function registerCommands(appId, guildId, guildName) {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
    console.log(`✅ Commands registered in: ${guildName}`);
  } catch (err) {
    console.error(`❌ Failed to register in ${guildName}:`, err.message);
  }
}

client.once("clientReady", async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  for (const guild of readyClient.guilds.cache.values()) {
    await registerCommands(readyClient.user.id, guild.id, guild.name);
  }
});

// Log reconnection events so we can see when the connection drops/recovers
client.on("shardDisconnect", (event, id) => {
  console.warn(`⚠️ Shard ${id} disconnected (code: ${event.code}). Will auto-reconnect...`);
});
client.on("shardReconnecting", (id) => {
  console.log(`🔄 Shard ${id} reconnecting...`);
});
client.on("shardResume", (id, replayed) => {
  console.log(`✅ Shard ${id} resumed (replayed ${replayed} events)`);
});

client.on("guildCreate", async (guild) => {
  await registerCommands(client.user.id, guild.id, guild.name);
});

// ── Interaction handler ───────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {

  // ── /vouch slash command ────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "vouch") {
    await interaction.deferReply();
    try {
      const buyer = interaction.options.getUser("buyer");
      const product = interaction.options.getString("product");
      const payment = interaction.options.getString("payment");

      const data = loadData();
      data.orderCount += 1;
      const orderNum = data.orderCount;

      const vouchKey = `${buyer.id}_${orderNum}`;
      data.pending[vouchKey] = {
        buyerTag: buyer.username,
        buyerId: buyer.id,
        buyerMention: `<@${buyer.id}>`,
        product,
        payment,
        orderNum,
        sellerId: interaction.user.id,
      };
      saveData(data);

      const button = new ButtonBuilder()
        .setCustomId(`review_${vouchKey}`)
        .setLabel("⭐ Leave a Review")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(button);

      const promptEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("🎉 Order Completed!")
        .setDescription(
          `Hey ${buyer} — your order is done! 🙌\n` +
          `Please take a moment to leave a quick review below.\n` +
          `Your feedback helps the community! 💙`
        )
        .addFields(
          { name: "🔒 Product", value: `\`${product}\``, inline: true },
          { name: `${getPaymentEmoji(payment)} Payment`, value: `\`${payment}\``, inline: true }
        )
        .setFooter({ text: "KRAKEN BOT • Vouch System • Click the button below!" })
        .setTimestamp();

      await interaction.editReply({ embeds: [promptEmbed], components: [row] });
      console.log(`📦 Order #${orderNum} created for buyer ${buyer.username}`);
    } catch (err) {
      console.error("❌ /vouch error:", err);
      await interaction.editReply({ content: "❌ Something went wrong. Please try again." });
    }
    return;
  }

  // ── Leave a Review button ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("review_")) {
    try {
      const vouchKey = interaction.customId.replace("review_", "");
      const data = loadData();
      const pending = data.pending[vouchKey];

      if (!pending) {
        await interaction.reply({
          content: "❌ This review request has already been completed or expired.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.user.id !== pending.buyerId) {
        await interaction.reply({
          content: "❌ Only the buyer can leave this review.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_${vouchKey}`)
        .setTitle("⭐ Leave Your Review");

      const starsInput = new TextInputBuilder()
        .setCustomId("stars")
        .setLabel("Rating (enter a number 1 to 5)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("5")
        .setMinLength(1)
        .setMaxLength(1)
        .setRequired(true);

      const feedbackInput = new TextInputBuilder()
        .setCustomId("feedback")
        .setLabel("Your feedback about the seller")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Great seller, super fast and trustworthy! 🔥")
        .setMaxLength(500)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(starsInput),
        new ActionRowBuilder().addComponents(feedbackInput)
      );

      await interaction.showModal(modal);
      console.log(`🖊️ Review modal shown to ${interaction.user.username}`);
    } catch (err) {
      console.error("❌ Button error:", err);
    }
    return;
  }

  // ── Modal submit ────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const vouchKey = interaction.customId.replace("modal_", "");
      const data = loadData();
      const pending = data.pending[vouchKey];

      if (!pending) {
        await interaction.editReply({ content: "❌ Review data not found. Please contact an admin." });
        return;
      }

      const starsRaw = interaction.fields.getTextInputValue("stars").trim();
      const feedback = interaction.fields.getTextInputValue("feedback").trim();
      const stars = parseInt(starsRaw, 10);

      if (isNaN(stars) || stars < 1 || stars > 5) {
        await interaction.editReply({ content: "❌ Please enter a valid rating between **1 and 5**." });
        return;
      }

      delete data.pending[vouchKey];
      saveData(data);

      const gifPath = path.join(__dirname, "banner-thunder.gif");
      const bannerPath = path.join(__dirname, "banner.png");
      const gifExists = fs.existsSync(gifPath);
      const bannerFile = gifExists ? gifPath : bannerPath;
      const bannerName = gifExists ? "banner-thunder.gif" : "banner.png";
      const attachment = new AttachmentBuilder(bannerFile, { name: bannerName });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({
          name: `@${interaction.user.username} — Review Submitted`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTitle(`✅  Completed Order #${pending.orderNum}`)
        .addFields(
          { name: "⭐  Stars:", value: buildStars(stars), inline: true },
          { name: "👤  Buyer:", value: `${pending.buyerMention}\n\`${pending.buyerTag}\``, inline: true },
          { name: `${getPaymentEmoji(pending.payment)}  Payment:`, value: formatPayment(pending.payment), inline: true },
          { name: "🔒  Product:", value: `\`${pending.product}\``, inline: false },
          { name: "💬  Feedback:", value: `\`\`\`${feedback}\`\`\``, inline: false }
        )
        .setImage(`attachment://${bannerName}`)
        .setFooter({ text: "KRAKEN BOT • Vouch System" })
        .setTimestamp();

      const vouchChannel = await client.channels.fetch(VOUCH_CHANNEL_ID);
      await vouchChannel.send({
        content: `✅ <@${pending.buyerId}> — Review Submitted`,
        embeds: [embed],
        files: [attachment],
      });

      console.log(`✅ Vouch posted for order #${pending.orderNum} by ${interaction.user.username}`);
      await interaction.editReply({ content: "✅ Thanks for your review! It has been posted. 🙏" });
    } catch (err) {
      console.error("❌ Modal submit error:", err);
      await interaction.editReply({ content: "❌ Something went wrong. Please contact an admin." });
    }
    return;
  }
});

client.login(TOKEN);
