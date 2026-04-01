const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const express = require('express');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const OWNER_ID = "YOUR_USER_ID";
const ALLOWED_CHANNEL_ID = "YOUR_CHANNEL_ID"; // bot only works here

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

// ================= CLIENT =================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ================= HELPERS =================
function getBalance(userId) {
    if (!balances[userId]) balances[userId] = 500;
    return balances[userId];
}

// ================= BOT READY =================
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ================= COMMANDS =================
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // lock bot to one channel
    if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
        return interaction.reply({
            content: "Use this bot in the correct channel.",
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const name = interaction.commandName;

    getBalance(userId);

    // -------- NOMINATE --------
    if (name === "nominate") {
        const player = interaction.options.getString("player");
        const amount = interaction.options.getInteger("amount");

        if (amount < 20) {
            return interaction.reply("Minimum bet is 20 abz bucks.");
        }

        if (balances[userId] < amount) {
            return interaction.reply("You don't have enough abz bucks.");
        }

        balances[userId] -= amount;

        if (!nominations[player]) nominations[player] = [];
        nominations[player].push({ userId, amount });

        saveData();

        return interaction.reply(
            `${interaction.user.username} bet ${amount} abz bucks on "${player}".`
        );
    }

    // -------- WINNER (OWNER ONLY) --------
    if (name === "winner") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Only the owner can use this.");
        }

        const player = interaction.options.getString("player");

        const bets = nominations[player];
        if (!bets || bets.length === 0) {
            return interaction.reply("No bets on that player.");
        }

        const totalPool = Object.values(nominations)
            .flat()
            .reduce((a, b) => a + b.amount, 0);

        const winnerPool = bets.reduce((a, b) => a + b.amount, 0);

        const profitPool = totalPool - winnerPool;

        const split = profitPool / bets.length;

        for (const bet of bets) {
            balances[bet.userId] += bet.amount; // return original bet
            balances[bet.userId] += split; // profit share
        }

        nominations = {};
        saveData();

        return interaction.reply(
            `${player} wins!\nTotal pool: ${totalPool}\nEach winner gets profit share.`
        );
    }

    // -------- LEADERBOARD --------
    if (name === "leaderboard") {
        const sorted = Object.entries(balances)
            .sort((a, b) => b[1] - a[1]);

        let msg = "**ABZ Bucks Leaderboard**\n\n";

        for (const [userId, bal] of sorted) {
            msg += `<@${userId}>: ${bal} abz bucks\n`;
        }

        return interaction.reply(msg);
    }

    // -------- TRANSFER --------
    if (name === "transfer") {
        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");

        if (amount <= 0) return interaction.reply("Invalid amount.");
        if (balances[userId] < amount) {
            return interaction.reply("Not enough abz bucks.");
        }

        balances[userId] -= amount;
        getBalance(target.id);
        balances[target.id] += amount;

        saveData();

        return interaction.reply(
            `Transferred ${amount} abz bucks to ${target.username}.`
        );
    }

    // -------- WEEKLY +10 --------
    if (name === "weekly") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Only owner can run weekly update.");
        }

        for (const id in balances) {
            balances[id] += 10;
        }

        saveData();

        return interaction.reply("Everyone received +10 abz bucks.");
    }

    // -------- CLEAR NOMINEES --------
    if (name === "clearnominees") {
        if (userId !== OWNER_ID) {
            return interaction.reply("Only owner can clear nominations.");
        }

        nominations = {};
        saveData();

        return interaction.reply("Nominations cleared.");
    }
});

// ================= REGISTER COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("nominate")
        .setDescription("Bet abz bucks on a player")
        .addStringOption(o =>
            o.setName("player").setRequired(true).setDescription("Any name"))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true).setDescription("Min 20")),

    new SlashCommandBuilder()
        .setName("winner")
        .setDescription("Declare winner (owner only)")
        .addStringOption(o =>
            o.setName("player").setRequired(true)),

    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show abz bucks leaderboard"),

    new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Send abz bucks to someone")
        .addUserOption(o =>
            o.setName("user").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setRequired(true)),

    new SlashCommandBuilder()
        .setName("weekly")
        .setDescription("Give everyone +10 (owner only)"),

    new SlashCommandBuilder()
        .setName("clearnominees")
        .setDescription("Clear all nominations (owner only)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
    );
    console.log("Commands registered.");
})();

// ================= KEEP ALIVE (RENDER) =================
const app = express();

app.get("/", (req, res) => {
    res.send("ABZ bot running");
});

app.listen(3000);

// ================= START BOT =================
client.login(TOKEN);
