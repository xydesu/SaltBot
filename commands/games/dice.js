const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('和 Salt 一起擲骰子にゃ')
        .addIntegerOption(option =>
            option.setName('sides')
                .setDescription('要幾面的骰子呢にゃ？(預設6面)')
                .setMinValue(2)
                .setMaxValue(100)
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('要擲幾個骰子呢にゃ？(預設1個)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const sides = interaction.options.getInteger('sides') || 6;
        const count = interaction.options.getInteger('count') || 1;

        const results = [];
        let total = 0;

        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            results.push(roll);
            total += roll;
        }

        const embed = new EmbedBuilder()
            .setColor(0x8A2BE2)
            .setTitle('🎲 Salt 的擲骰子結果にゃ')
            .setDescription(getDiceAnimation())
            .addFields(
                {
                    name: `🎯 ${count}個 ${sides}面骰子`,
                    value: results.map((result, index) =>
                        `骰子 ${index + 1}: **${result}** ${getDiceEmoji(result)}`
                    ).join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: `由 ${interaction.user.username} 和 Salt 一起擲出にゃ`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        if (count > 1) {
            embed.addFields({
                name: '📊 統計',
                value: `總和: **${total}**\n平均: **${(total / count).toFixed(1)}**\n最高: **${Math.max(...results)}**\n最低: **${Math.min(...results)}**`,
                inline: true
            });
        }

        // 特殊結果提示
        if (count === 1) {
            embed.addFields({
                name: '🎭 Salt 看運勢',
                value: getLuckMessage(results[0], sides),
                inline: true
            });
        }

        // 檢查特殊組合
        if (count > 1) {
            const specialResult = checkSpecialCombination(results);
            if (specialResult) {
                embed.addFields({
                    name: '✨ Salt 發現特殊組合',
                    value: specialResult,
                    inline: false
                });
            }
        }

        await interaction.reply({ embeds: [embed] });
    },
};

function getDiceAnimation() {
    const animations = [
        '🎲 *Salt 幫你把骰子擲到空中にゃ...*',
        '🎲 *Salt 看著骰子彈跳著落地にゃ...*',
        '🎲 *Salt 等骰子滾動停下にゃ...*',
        '🎲 *Salt 說命運之骰已定にゃ...*'
    ];
    return animations[Math.floor(Math.random() * animations.length)];
}

function getDiceEmoji(number) {
    const emojis = {
        1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
    };
    return emojis[number] || '🎲';
}

function getLuckMessage(result, sides) {
    const percentage = result / sides;

    if (result === sides) return '🌟 Salt 說完美！最大值にゃ！';
    if (result === 1) return '💫 Salt 說最小值，但這也是一種運氣にゃ！';
    if (percentage >= 0.8) return '🍀 Salt 說非常幸運にゃ！';
    if (percentage >= 0.6) return '😊 Salt 說運氣不錯にゃ！';
    if (percentage >= 0.4) return '😐 Salt 說平平運氣にゃ';
    if (percentage >= 0.2) return '😅 Salt 說運氣一般にゃ';
    return '🌧️ Salt 說今天運氣欠佳にゃ...';
}

function checkSpecialCombination(results) {
    const uniqueResults = [...new Set(results)];

    // 全部相同
    if (uniqueResults.length === 1) {
        return `🎊 Salt 發現全部都是 ${results[0]} にゃ！太神奇了にゃ！`;
    }

    // 連續數字
    const sorted = [...results].sort((a, b) => a - b);
    let isSequential = true;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) {
            isSequential = false;
            break;
        }
    }

    if (isSequential && uniqueResults.length === results.length) {
        return '🎯 Salt 說連續數字にゃ！完美順子にゃ！';
    }

    // 檢查對子、三條等
    const counts = {};
    results.forEach(result => {
        counts[result] = (counts[result] || 0) + 1;
    });

    const countValues = Object.values(counts).sort((a, b) => b - a);

    if (countValues[0] === results.length - 1 && results.length > 2) {
        return '🎪 Salt 說差一點就全相同了にゃ！';
    }

    if (countValues[0] >= 3) {
        return '🎨 Salt 發現三條にゃ！運氣爆棚にゃ！';
    }

    if (countValues[0] === 2 && countValues[1] === 2) {
        return '👥 Salt 說兩對にゃ！不錯的組合にゃ！';
    }

    return null;
}
