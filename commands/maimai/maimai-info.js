const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { getGameStats } = require('../../utils/maimaiApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-info')
        .setDescription('Salt 來介紹 maimai DX 的小知識にゃ')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const stats = await getGameStats();
        
        const embed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('🎵 maimai DX 遊戲資訊にゃ')
            .setDescription('Salt 來告訴你 maimai DX 的統計資訊にゃ～')
            .addFields(
                { name: '🎶 總歌曲數', value: `${stats.totalSongs || 0} 首にゃ`, inline: true },
                { name: '📊 總譜面數', value: `${stats.totalCharts || 0} 個にゃ`, inline: true },
                { name: '🎯 平均BPM', value: `${stats.averageBPM || 0}`, inline: true },
                { name: '📈 難度分佈', value: stats.difficultyDistribution || '沒有資料にゃ', inline: false },
                { name: '📂 類型分佈', value: stats.genreDistribution || '沒有資料にゃ', inline: false },
                { name: '🏆 難度統計', value: stats.levelStats || '沒有資料にゃ', inline: false }
            )
            .setFooter({ 
                text: `資料統計 | 由 ${interaction.user.username} 請求`, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();
        
        // 添加最高難度歌曲
        if (stats.hardestSong) {
            embed.addFields({
                name: '💀 最高難度歌曲',
                value: `${stats.hardestSong.title} - ${stats.hardestSong.artist}\n` +
                       `等級: ${stats.hardestSong.level}`,
                inline: true
            });
        }
        
        // 添加最多Note的歌曲
        if (stats.mostNotesSong) {
            embed.addFields({
                name: '💎 最多Note歌曲',
                value: `${stats.mostNotesSong.title}\n` +
                       `${stats.mostNotesSong.notes} Notes`,
                inline: true
            });
        }
        
        // 添加遊戲小知識
        embed.addFields({
            name: '💡 maimai DX 小知識',
            value: getMaimaiTrivia(),
            inline: false
        });
        
        // 添加推薦功能
        embed.addFields({
            name: '🎮 推薦功能',
            value: '• `/maimai-random` - 隨機選歌\n' +
                   '• `/maimai-search` - 搜尋歌曲\n' +
                   '• `/maimai-rating` - 計算Rating\n' +
                   '• `/maimai-daily` - 每日推薦',
            inline: false
        });

        embed.addFields({
            name: ':information_source: 銘謝',
            value: '• [Otoge-DB](https://github.com/zvuc/otoge-db) - 曲目數據和封面'
        })
        
        await interaction.editReply({ embeds: [embed] });
        
        } catch (error) {
            console.error('獲取 maimai 遊戲資訊時發生錯誤:', error);
            await interaction.editReply({
                content: '❌ 獲取遊戲資訊時發生錯誤，請稍後再試。'
            });
        }
    },
};



function getMaimaiTrivia() {
    const trivia = [
        '🎵 maimai 是 SEGA 開發的音樂遊戲',
        '🎯 遊戲使用圓形觸控螢幕進行操作',
        '🌟 DX 版本增加了滑動操作',
        '🎼 遊戲包含多種音樂類型',
        '💫 Rating 系統幫助玩家追蹤進步',
        '🎪 每個月都會有新歌曲更新',
        '🏆 遊戲有豐富的稱號和頭像系統',
        '🎮 支援多人同時遊玩'
    ];
    
    return trivia[Math.floor(Math.random() * trivia.length)];
}
