const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const express = require('express');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const OWNER_ID = "715316760462491673";
const ALLOWED_CHANNEL_ID = "1488832547864580126";

// ================= DATA =================
let balances = {};
let nominations = {};

// ================= LOAD / SAVE =================
function loadData() {
    if (fs.existsSync("data.json")) {
        const data = JSON.parse(fs.readFileSync("data.json"));
        balances = data.balances || {};
        nominations = data.nominations || {};
    }
}

function saveData() {
    fs.writeFileSync("data.json", JSON.stringify({ balances, nominations }, null, 2));
}

loadData();

// ================= HELPERS =================
function getBalance(userId) {
    if (!balances[userId]) balances[userId] = 500;
    return balances[userId];
}

// ================= CLIENT =================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
        return interaction.reply({
            content: "Wrong channel.",
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const name = interaction.commandName;

    getBalance(userId);

    // ================= NOMINATE =================
    if (name === "nominate") {
        const player = interaction.options.getString("player");
        const amount = interaction.options.getInteger("amount");

        if (amount < 20) {
            return interaction.reply("Min bet is 20 abz bucks.");
        }

        if (balances[userId] < amount) {
            return interaction.reply("Not enough abz bucks.");
        }

        balances[userId] -= amount;

        if (!nominations[player]) nominations[player] = [];
        nominations[player].push({ userId, amount });

        saveData();

        return interaction.reply(
            `${interaction.user.username} bet ${amount} on "${player}"`
        );
    }

    // ================= WINNER =================
    if (name === "winner") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Only owner can use this.");
        }

        const player = interaction.options.getString("player");
        const bets = nominations[player];

        if (!bets || bets.length === 0) {
            return interaction.reply("No bets on this player.");
        }

        const totalPool = Object.values(nominations)
            .flat()
            .reduce((sum, b) => sum + b.amount, 0);

        const winnerTotal = bets.reduce((sum, b) => sum + b.amount, 0);
        const profitPool = totalPool - winnerTotal;

        const split = bets.length > 0 ? profitPool / bets.length : 0;

        for (const bet of bets) {
            getBalance(bet.userId);
            balances[bet.userId] += bet.amount + split;
        }

        nominations = {};
        saveData();

        return interaction.reply(
            `${player} wins!\nPool: ${totalPool}`
        );
    }

    // ================= LEADERBOARD =================
    if (name === "leaderboard") {
        const sorted = Object.entries(balances)
            .sort((a, b) => b[1] - a[1]);

        let msg = "**ABZ Bucks Leaderboard**\n\n";

        for (const [id, bal] of sorted) {
            msg += `<@${id}> — ${bal} abz bucks\n`;
        }

        return interaction.reply(msg);
    }

    // ================= TRANSFER =================
    if (name === "transfer") {
        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");

        if (!target) return interaction.reply("Invalid user.");
        if (amount <= 0) return interaction.reply("Invalid amount.");
        if (balances[userId] < amount) {
            return interaction.reply("Not enough abz bucks.");
        }

        getBalance(target.id);

        balances[userId] -= amount;
        balances[target.id] += amount;

        saveData();

        return interaction.reply(`Sent ${amount} abz bucks to ${target.username}`);
    }

    // ================= WEEKLY =================
    if (name === "weekly") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Owner only.");
        }

        for (const id in balances) {
            balances[id] += 10;
        }

        saveData();
        return interaction.reply("Everyone got +10 abz bucks.");
    }

    // ================= CLEAR =================
    if (name === "clearnominees") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Owner only.");
        }

        nominations = {};
        saveData();

        return interaction.reply("Cleared nominations.");
    }
});

// ================= COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("nominate")
        .setDescription("Just A Game")
        .addStringOption(o =>
            o.setName("player").setRequired(true).setDescription("Name"))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true).setDescription("Min 20")),

    new SlashCommandBuilder()
        .setName("winner")
        .setDescription("Set winner (owner only)")
        .addStringOption(o =>
            o.setName("player").setRequired(true).setDescription("Winner name")),

    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Just A Game"),

    new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Just A Game")
        .addUserOption(o =>
            o.setName("user").setRequired(true).setDescription("User"))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true).setDescription("Amount")),

    new SlashCommandBuilder()
        .setName("weekly")
        .setDescription("Give +10 (owner only)"),

    new SlashCommandBuilder()
        .setName("clearnominees")
        .setDescription("Clear bets (owner only)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
    );
    console.log("Commands registered.");
})();

// ================= EXPRESS KEEP ALIVE =================
const app = express();

app.get("/", (req, res) => {
    res.send("ABZ bot running");
});

app.listen(3000);

// ================= LOGIN =================
client.login(TOKEN);
