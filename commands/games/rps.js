const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('和 Salt 玩石頭剪刀布にゃ')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('你要出什麼呢にゃ？')
                .setRequired(false)
                .addChoices(
                    { name: '🪨 石頭', value: 'rock' },
                    { name: '📄 布', value: 'paper' },
                    { name: '✂️ 剪刀', value: 'scissors' }
                ))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const userChoice = interaction.options.getString('choice');

        if (!userChoice) {
            // 顯示按鈕介面
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle('🎮 和 Salt 對戰にゃ')
                .setDescription('選擇你的武器にゃ！我已經準備好了～')
                .addFields({
                    name: '🎯 遊戲規則',
                    value: '石頭勝剪刀，剪刀勝布，布勝石頭',
                    inline: false
                });

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('rps_rock')
                        .setLabel('石頭')
                        .setEmoji('🪨')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('rps_paper')
                        .setLabel('布')
                        .setEmoji('📄')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('rps_scissors')
                        .setLabel('剪刀')
                        .setEmoji('✂️')
                        .setStyle(ButtonStyle.Danger)
                );

            return await interaction.reply({
                embeds: [embed],
                components: [buttons]
            });
        }

        // 直接選擇模式
        const result = playRPS(userChoice);
        const embed = createResultEmbed(userChoice, result.botChoice, result.outcome, interaction.user);

        await interaction.reply({ embeds: [embed] });
    },
};

function playRPS(userChoice) {
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    let outcome;
    if (userChoice === botChoice) {
        outcome = 'tie';
    } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
    ) {
        outcome = 'win';
    } else {
        outcome = 'lose';
    }

    return { botChoice, outcome };
}

function createResultEmbed(userChoice, botChoice, outcome, user) {
    const choiceEmojis = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️'
    };

    const choiceNames = {
        rock: '石頭',
        paper: '布',
        scissors: '剪刀'
    };

    let color, title, description;

    switch (outcome) {
        case 'win':
            color = 0x00FF00;
            title = '🎉 Salt 說你贏了にゃ！';
            description = '恭喜你獲得勝利にゃ！';
            break;
        case 'lose':
            color = 0xFF0000;
            title = '😅 Salt 贏了にゃ！';
            description = 'Salt 這次運氣比較好にゃ～不要氣餒，再試一次にゃ！';
            break;
        case 'tie':
            color = 0xFFFF00;
            title = '🤝 Salt 跟你想得一樣にゃ！';
            description = '英雄所見略同にゃ！';
            break;
    }

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .addFields(
            {
                name: '👤 你的選擇',
                value: `${choiceEmojis[userChoice]} ${choiceNames[userChoice]}`,
                inline: true
            },
            {
                name: '🤖 Salt 的選擇',
                value: `${choiceEmojis[botChoice]} ${choiceNames[botChoice]}`,
                inline: true
            },
            {
                name: '🎯 結果',
                value: outcome === 'win' ? '你勝利にゃ！' : outcome === 'lose' ? 'Salt勝利にゃ！' : '平手にゃ！',
                inline: false
            }
        )
        .setFooter({
            text: `由 ${user.username} 發起`,
            iconURL: user.displayAvatarURL()
        })
        .setTimestamp();
}

// 匯出供按鈕互動使用
module.exports.playRPS = playRPS;
module.exports.createResultEmbed = createResultEmbed;
