const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { getMaimaiSongs, getRandomSong, convertSongData, formatConstant, getGenreEmoji } = require('../../utils/maimaiApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-random')
        .setDescription('Salt 幫你隨機推薦 maimai DX 歌曲にゃ')
        .addStringOption(option =>
            option.setName('difficulty')
                .setDescription('想玩什麼難度呢にゃ？')
                .setRequired(false)
                .addChoices(
                    { name: '🟢 BASIC', value: 'basic' },
                    { name: '🟡 ADVANCED', value: 'advanced' },
                    { name: '🔴 EXPERT', value: 'expert' },
                    { name: '🟣 MASTER', value: 'master' },
                    { name: '⚪ Re:MASTER', value: 'remaster' }
                ))
        .addStringOption(option =>
            option.setName('level')
                .setDescription('想挑戰什麼等級呢にゃ？(支援+號，如: 13+)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('genre')
                .setDescription('喜歡什麼類型的音樂にゃ？')
                .setRequired(false)
                .addChoices(
                    { name: '🎵 POPS & ANIME', value: 'pops' },
                    { name: '🎮 niconico & VOCALOID', value: 'niconico' },
                    { name: '🎯 東方Project', value: 'touhou' },
                    { name: '🎪 GAME & VARIETY', value: 'game' },
                    { name: '🎼 maimai', value: 'maimai' },
                    { name: '🌟 オンゲキ', value: 'ongeki' }
                ))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply();

        const difficulty = interaction.options.getString('difficulty');
        const level = interaction.options.getString('level');
        const genre = interaction.options.getString('genre');

        try {
            // 從真實 API 獲取歌曲資料
            const songs = await getMaimaiSongs();

            // 構建篩選條件
            const filters = {};
            if (difficulty) filters.difficulty = difficulty;
            if (level) filters.level = level;
            if (genre) filters.genre = genre;

            // 隨機選擇歌曲
            const randomSong = getRandomSong(songs, filters);

            if (!randomSong) {
                return await interaction.editReply({
                    content: '❌ 找不到符合條件的歌曲にゃ！要不要調整一下篩選條件呢にゃ？'
                });
            }

            // 為選中的歌曲找到符合條件的譜面
            let selectedChart = null;

            // 如果指定了難度或等級，選擇對應譜面
            if (difficulty || level) {
                const matchingCharts = randomSong.charts.filter(chart => {
                    return (!difficulty || chart.difficulty === difficulty) &&
                        (!level || chart.level === level);
                });
                if (matchingCharts.length > 0) {
                    selectedChart = matchingCharts[Math.floor(Math.random() * matchingCharts.length)];
                }
            } else {
                // 隨機選擇一個譜面
                selectedChart = randomSong.charts[Math.floor(Math.random() * randomSong.charts.length)];
            }

            // 如果沒有找到符合條件的譜面，使用第一個作為後備
            if (!selectedChart && randomSong.charts.length > 0) {
                selectedChart = randomSong.charts[0];
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle('🎲 Salt 的隨機選歌にゃ')
                .setDescription(`🎵 **${randomSong.title}**\n這首歌很不錯にゃ～快去試試看にゃ！`)
                .addFields(
                    { name: '🎤 藝術家', value: randomSong.artist, inline: true },
                    { name: '📂 類型', value: `${getGenreEmoji(randomSong.genre)} ${randomSong.genreName}`, inline: true },
                    { name: '🎯 BPM', value: randomSong.bpm.toString(), inline: true }
                )
                .setFooter({
                    text: `特別為 ${interaction.user.username} 挑選的にゃ 🐾`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            // 設定歌曲封面圖片
            if (randomSong.imageUrl) {
                // 檢查是否為完整 URL，如果不是則構建完整 URL
                let imageUrl = randomSong.imageUrl;
                if (!imageUrl.startsWith('http')) {
                    // 如果只是檔案名稱，構建完整的 maimai 圖片 URL
                    imageUrl = `https://otoge-db.net/maimai/jacket/${imageUrl}`;
                }

                try {
                    embed.setThumbnail(imageUrl);
                } catch (error) {
                    console.warn('無法設定歌曲圖片:', imageUrl, error.message);
                    // 如果設定圖片失敗，不影響其他功能
                }
            }

            // 添加推薦譜面資訊
            if (selectedChart) {
                embed.addFields({
                    name: '🎯 Salt 推薦這個譜面にゃ',
                    value: `${getDifficultyEmoji(selectedChart.difficulty)} **${selectedChart.difficulty.toUpperCase()}** ${selectedChart.level}` +
                        `${selectedChart.constant !== null ? ` (定數: ${formatConstant(selectedChart.constant)})` : ''}` +
                        `${selectedChart.notes ? `\n🎵 Note 數: ${selectedChart.notes}` : ''}`,
                    inline: false
                });
            }

            // 顯示所有可用譜面 - 分開 STD 和 DX
            const stdCharts = randomSong.charts.filter(chart => !chart.difficulty.startsWith('dx_'));
            const dxCharts = randomSong.charts.filter(chart => chart.difficulty.startsWith('dx_'));

            let chartsDisplay = '';

            if (stdCharts.length > 0) {
                const stdChartsText = stdCharts.map(chart =>
                    `${getDifficultyEmoji(chart.difficulty)} ${chart.level}${chart.constant !== null ? ` (${formatConstant(chart.constant)})` : ''}`
                ).join(' ');
                chartsDisplay += `**STD:** ${stdChartsText}`;
            }

            if (dxCharts.length > 0) {
                const dxChartsText = dxCharts.map(chart =>
                    `${getDifficultyEmoji(chart.difficulty.replace('dx_', ''))} ${chart.level}${chart.constant !== null ? ` (${formatConstant(chart.constant)})` : ''}`
                ).join(' ');
                if (chartsDisplay) chartsDisplay += '\n';
                chartsDisplay += `**DX:** ${dxChartsText}`;
            }

            embed.addFields({
                name: '📊 所有可用譜面にゃ',
                value: chartsDisplay || '沒有譜面資料にゃ',
                inline: false
            });

            // 添加使用提示
            const filterInfo = [];
            if (difficulty) filterInfo.push(`難度: ${difficulty.toUpperCase()}`);
            if (level) filterInfo.push(`等級: ${level}`);
            if (genre) filterInfo.push(`類型: ${randomSong.genreName}`);

            if (filterInfo.length > 0) {
                embed.addFields({
                    name: '🔍 你選的篩選條件にゃ',
                    value: filterInfo.join(' | '),
                    inline: false
                });
            }

            embed.addFields({
                name: '💡 Salt 的小建議にゃ',
                value: '• 用 `/maimai-rating` 來算這首歌的 Rating にゃ\n' +
                    '• 用 `/maimai-search` 找更多好歌にゃ\n' +
                    '• 再用一次這個指令會推薦不同歌曲にゃ',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('隨機選擇 maimai 歌曲時發生錯誤:', error);
            await interaction.editReply({
                content: '❌ 選歌的時候出問題了にゃ！等一下再試試看にゃ？'
            });
        }
    },
};