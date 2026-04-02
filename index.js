const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs/promises');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const OWNER_ID = "715316760462491673";
const ALLOWED_CHANNEL_ID = "1488832547864580126";

// ================= DATA =================
let balances = {};
let nominations = {};
let ready = false;

// ================= LOAD / SAVE =================
async function loadData() {
    try {
        const data = JSON.parse(await fs.readFile("data.json", "utf8"));
        balances = data.balances || {};
        nominations = data.nominations || {};
        console.log("Data loaded");
    } catch {
        console.log("No data file yet, starting fresh");
    }
}

async function saveData() {
    try {
        await fs.writeFile(
            "data.json",
            JSON.stringify({ balances, nominations }, null, 2)
        );
    } catch (err) {
        console.log("Save failed:", err);
    }
}

// ================= CLIENT =================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ================= SAFETY =================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ================= READY =================
client.once("ready", () => {
    ready = true;
    console.log(`Logged in as ${client.user.tag}`);

    setInterval(() => {
        console.log("heartbeat alive | ws:", client.ws.status);
    }, 60000);
});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async (interaction) => {
    try {
        if (!ready) return;

        if (!interaction.isChatInputCommand()) return;

        if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
            return interaction.reply({ content: "Wrong channel.", ephemeral: true });
        }

        const userId = interaction.user.id;
        const name = interaction.commandName;

        if (!balances[userId]) balances[userId] = 500;

        // ========== NOMINATE ==========
        if (name === "nominate") {
            const player = interaction.options.getString("player");
            const amount = interaction.options.getInteger("amount");

            if (amount < 20) return interaction.reply("Min bet is 20.");
            if (balances[userId] < amount) return interaction.reply("Not enough.");

            balances[userId] -= amount;

            if (!nominations[player]) nominations[player] = [];
            nominations[player].push({ userId, amount });

            await saveData();

            return interaction.reply(`${interaction.user.username} bet ${amount} on ${player}`);
        }

        // ========== WINNER ==========
        if (name === "winner") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            const player = interaction.options.getString("player");
            const bets = nominations[player];

            if (!bets?.length) return interaction.reply("No bets.");

            const totalPool = Object.values(nominations).flat()
                .reduce((sum, b) => sum + b.amount, 0);

            const winnerTotal = bets.reduce((sum, b) => sum + b.amount, 0);
            const profitPool = totalPool - winnerTotal;

            const split = bets.length ? profitPool / bets.length : 0;

            for (const bet of bets) {
                if (!balances[bet.userId]) balances[bet.userId] = 500;
                balances[bet.userId] += bet.amount + split;
            }

            nominations = {};
            await saveData();

            return interaction.reply(`${player} wins! Pool: ${totalPool}`);
        }

        // ========== LEADERBOARD ==========
        if (name === "leaderboard") {
            const sorted = Object.entries(balances)
                .sort((a, b) => b[1] - a[1]);

            let msg = "**ABZ Bucks Leaderboard**\n\n";

            for (const [id, bal] of sorted) {
                msg += `<@${id}> — ${bal}\n`;
            }

            return interaction.reply(msg);
        }

        // ========== TRANSFER ==========
        if (name === "transfer") {
            const target = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");

            if (!target || amount <= 0) return interaction.reply("Invalid input.");
            if (balances[userId] < amount) return interaction.reply("Not enough.");

            if (!balances[target.id]) balances[target.id] = 500;

            balances[userId] -= amount;
            balances[target.id] += amount;

            await saveData();

            return interaction.reply(`Sent ${amount} to ${target.username}`);
        }

        // ========== WEEKLY ==========
        if (name === "weekly") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            for (const id in balances) balances[id] += 10;

            await saveData();
            return interaction.reply("Everyone got +10.");
        }

        // ========== CLEAR ==========
        if (name === "clearnominees") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            nominations = {};
            await saveData();

            return interaction.reply("Cleared.");
        }

    } catch (err) {
        console.log("Command error:", err);
    }
});

// ================= COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("nominate")
        .setDescription("Bet system")
        .addStringOption(o =>
            o.setName("player").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true)),

    new SlashCommandBuilder()
        .setName("winner")
        .setDescription("Owner only")
        .addStringOption(o =>
            o.setName("player").setRequired(true)),

    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show balances"),

    new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Send money")
        .addUserOption(o =>
            o.setName("user").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true)),

    new SlashCommandBuilder()
        .setName("weekly")
        .setDescription("Owner add +10"),

    new SlashCommandBuilder()
        .setName("clearnominees")
        .setDescription("Clear bets")
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await loadData();

    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log("Commands registered.");
    } catch (err) {
        console.log("Command register failed:", err);
    }
})();

// ================= LOGIN =================
client.login(TOKEN);
