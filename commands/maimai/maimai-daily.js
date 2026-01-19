const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { getMaimaiSongs, getRandomSong, formatConstant, getDifficultyEmoji, getGenreEmoji, getGenreName } = require('../../utils/maimaiApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-daily')
        .setDescription('今日 maimai DX 推薦歌曲')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('推薦類型')
                .setRequired(false)
                .addChoices(
                    { name: '🌅 晨練 (Lv.1-8 新手友好)', value: 'morning' },
                    { name: '☀️ 日常 (Lv.7-12 中等挑戰)', value: 'daily' },
                    { name: '🌙 夜戰 (Lv.12-14 高手專區)', value: 'night' },
                    { name: '💀 地獄 (Lv.14+ 頂尖挑戰)', value: 'hell' },
                    { name: '🎲 隨機 (全難度)', value: 'random' }
                ))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'daily';

        try {
            // 使用日期作為種子確保每日推薦的一致性
            const today = new Date();
            const dateString = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
            const seed = hashCode(dateString + type);

            const songs = await getMaimaiSongs();
            const recommendation = getDailyRecommendation(songs, type, seed);

            const embed = new EmbedBuilder()
                .setColor(getTypeColor(type))
                .setTitle(`${getTypeEmoji(type)} 今日 maimai DX 推薦`)
                .setDescription(`${getTypeDescription(type)}\n今天就來挑戰這首歌吧！`)
                .addFields(
                    { name: '🎶 今日推薦', value: `**${recommendation.song.title}**`, inline: false },
                    { name: '🎤 藝術家', value: recommendation.song.artist, inline: true },
                    { name: '📂 類型', value: `${getGenreEmoji(recommendation.song.genre)} ${getGenreName(recommendation.song.genre)}`, inline: true },
                    { name: '🎯 BPM', value: `${recommendation.song.bpm}`, inline: true },
                    { name: '📊 推薦譜面', value: `${getDifficultyEmoji(recommendation.chart.difficulty)} ${recommendation.chart.difficulty.toUpperCase()} ${recommendation.chart.level}`, inline: true },
                    { name: '🎵 定數', value: recommendation.chart.constant !== null ? formatConstant(recommendation.chart.constant) : '未知', inline: true },
                    { name: '💎 Note數', value: `${recommendation.chart.notes}`, inline: true }
                )
                .setFooter({
                    text: `每日推薦 | ${today.toLocaleDateString('zh-TW')} | 由 ${interaction.user.username} 請求`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            // 設定推薦歌曲的封面圖片
            if (recommendation.song.imageUrl) {
                // 檢查是否為完整 URL，如果不是則構建完整 URL
                let imageUrl = recommendation.song.imageUrl;
                if (!imageUrl.startsWith('http')) {
                    imageUrl = `https://otoge-db.net/maimai/jacket/${imageUrl}`;
                }

                try {
                    embed.setThumbnail(imageUrl);
                } catch (error) {
                    console.warn('無法設定歌曲圖片:', imageUrl, error.message);
                }
            }

            // 顯示所有譜面 - 分開 STD 和 DX
            const stdCharts = recommendation.song.charts.filter(chart => !chart.difficulty.startsWith('dx_'));
            const dxCharts = recommendation.song.charts.filter(chart => chart.difficulty.startsWith('dx_'));

            let allChartsDisplay = '';

            if (stdCharts.length > 0) {
                allChartsDisplay += '**STD:**\n';
                allChartsDisplay += stdCharts.map(chart =>
                    `${getDifficultyEmoji(chart.difficulty)} ${chart.difficulty.toUpperCase()} ${chart.level}${chart.constant !== null ? ` (${formatConstant(chart.constant)})` : ''}`
                ).join('\n');
            }

            if (dxCharts.length > 0) {
                if (allChartsDisplay) allChartsDisplay += '\n\n';
                allChartsDisplay += '**DX:**\n';
                allChartsDisplay += dxCharts.map(chart =>
                    `${getDifficultyEmoji(chart.difficulty.replace('dx_', ''))} ${chart.difficulty.replace('dx_', '').toUpperCase()} ${chart.level}${chart.constant !== null ? ` (${formatConstant(chart.constant)})` : ''}`
                ).join('\n');
            }

            embed.addFields({
                name: '📋 所有譜面',
                value: allChartsDisplay || '無譜面資料',
                inline: false
            });

            // 添加每日挑戰
            const challenge = getDailyChallenge(recommendation.chart, seed);
            embed.addFields({
                name: '🏆 今日挑戰',
                value: challenge,
                inline: false
            });

            // 添加練習建議
            embed.addFields({
                name: '💡 練習建議',
                value: getPracticeTip(recommendation.chart, type),
                inline: false
            });

            // 添加其他用戶也可以看到相同推薦的提示
            embed.addFields({
                name: '🌟 特別提醒',
                value: '所有人今天看到的推薦都是一樣的喔！快去和朋友一起挑戰吧！',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('獲取 maimai 每日推薦時發生錯誤:', error);
            await interaction.editReply({
                content: '❌ 獲取每日推薦時發生錯誤，請稍後再試。'
            });
        }
    },
};

// 簡單的字串雜湊函數
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 轉換為32位元整數
    }
    return Math.abs(hash);
}

function getDailyRecommendation(songs, type, seed) {
    let filteredSongs = [...songs];
    let levelFilter = null;

    // 根據類型篩選歌曲 - 考慮到高難度定數差距更大
    switch (type) {
        case 'morning':
            // 簡單：1-8級，適合新手和暖身
            levelFilter = chart => chart.level >= 1 && chart.level <= 8;
            break;
        case 'daily':
            // 日常：7-12級，中等難度，定數差距適中
            levelFilter = chart => chart.level >= 7 && chart.level <= 12;
            break;
        case 'night':
            // 夜戰：12-14級，高難度，定數差距開始變大
            levelFilter = chart => chart.level >= 12 && chart.level <= 14;
            break;
        case 'hell':
            // 地獄：14級以上，超高難度，定數差距極大
            levelFilter = chart => chart.level >= 14;
            break;
        case 'random':
        default:
            levelFilter = () => true;
            break;
    }

    // 篩選有符合條件譜面的歌曲
    filteredSongs = filteredSongs.filter(song =>
        song.charts.some(levelFilter)
    );

    // 使用種子選擇歌曲
    const songIndex = seed % filteredSongs.length;
    const selectedSong = filteredSongs[songIndex];

    // 選擇符合條件的譜面
    const validCharts = selectedSong.charts.filter(levelFilter);
    const chartIndex = Math.floor(seed / filteredSongs.length) % validCharts.length;
    const selectedChart = validCharts[chartIndex];

    return {
        song: selectedSong,
        chart: selectedChart
    };
}

function getTypeColor(type) {
    const colors = {
        morning: 0xFFE4B5,  // 淺橙色
        daily: 0x87CEEB,    // 天藍色
        night: 0x4B0082,    // 深紫色
        hell: 0xFF0000,     // 紅色
        random: 0xFF69B4    // 粉色
    };
    return colors[type] || 0x00BFFF;
}

function getTypeEmoji(type) {
    const emojis = {
        morning: '🌅',
        daily: '☀️',
        night: '🌙',
        hell: '💀',
        random: '🎲'
    };
    return emojis[type] || '🎵';
}

function getTypeDescription(type) {
    const descriptions = {
        morning: '早晨時光，新手友好的暖身運動！適合練習基礎技巧。',
        daily: '日常練習，穩定進步的好選擇！定數分布較為均勻。',
        night: '夜深人靜，高手的戰場！定數差距開始拉大，每一級都是挑戰！',
        hell: '地獄模式，頂尖玩家的試煉！定數差距極大，同級別內實力差異巨大！',
        random: '隨機推薦，命運選擇的歌曲！體驗各種難度的樂趣！'
    };
    return descriptions[type] || '今日推薦歌曲';
}

function getDailyChallenge(chart, seed) {
    // 根據難度等級調整挑戰目標
    const level = chart.level;
    let challenges = [];

    if (level <= 8) {
        // 低難度：重點在學習和熟練
        challenges = [
            `🎯 目標：達成 ${97 + (seed % 3)}% 以上的準確率`,
            `💎 完美：嘗試取得 80% 以上 Perfect`,
            `⭐ 評級：目標達成 S 以上評級`,
            `� 節奏：專注於跟上音樂節拍`,
            `📚 學習：熟悉基本的手法模式`
        ];
    } else if (level <= 12) {
        // 中難度：平衡準確率和技巧
        challenges = [
            `🎯 目標：達成 ${95 + (seed % 4)}% 以上的準確率`,
            `⚡ 挑戰：不使用技能道具完成`,
            `💎 完美：嘗試取得全 Perfect`,
            `🔥 連擊：保持 500+ 連擊`,
            `⭐ 評級：目標達成 SS 以上評級`
        ];
    } else if (level <= 14) {
        // 高難度：定數差距大，重點在突破
        challenges = [
            `🎯 目標：達成 ${92 + (seed % 5)}% 以上的準確率`,
            `🔥 連擊：嘗試保持 300+ 連擊（高難度下已是成就）`,
            `⭐ 評級：目標達成 S 評級（高難度下相當困難）`,
            `💪 毅力：完成整首歌曲不放棄`,
            `🧠 策略：找出困難段落並重點練習`
        ];
    } else {
        // 超高難度：定數差距極大，能完成就是勝利
        challenges = [
            `� 生存：完成整首歌曲就是勝利！`,
            `🎯 目標：達成 ${85 + (seed % 8)}% 以上的準確率`,
            `� 挑戰：突破個人最佳成績`,
            `🔥 連擊：任何長連擊都值得慶祝`,
            `🧠 分析：研究譜面模式和節奏變化`,
            `⏰ 耐心：多次嘗試，每次都有進步`
        ];
    }

    return challenges[seed % challenges.length];
}

function getPracticeTip(chart, type) {
    const level = chart.level;
    let baseTips = [];

    if (level <= 8) {
        // 低難度練習建議
        baseTips = [
            '先聽一遍音樂熟悉節奏和結構',
            '注意基本手部姿勢和按鍵力度',
            '專注於準確度，速度會自然提升',
            '多練習基本的 Tap 和 Hold 手法',
            '觀察音符與音樂的對應關係'
        ];
    } else if (level <= 12) {
        // 中難度練習建議
        baseTips = [
            '分段練習，先征服困難的部分',
            '注意 Slide 的方向和時機',
            '練習多指協調和手指獨立性',
            '熟悉常見的節奏模式和組合',
            '保持穩定的心率和呼吸'
        ];
    } else if (level <= 14) {
        // 高難度練習建議
        baseTips = [
            '同級別內定數差距大，需要循序漸進',
            '重點攻克技術難點，如複雜 Slide 組合',
            '練習快速的手指切換和位置記憶',
            '學會預讀譜面，提前準備手位',
            '接受失敗，每次進步都值得肯定'
        ];
    } else {
        // 超高難度練習建議
        baseTips = [
            '定數差距極大！14.0 和 15.0 是完全不同的世界',
            '需要長期練習和技術積累',
            '專注於特定技術的專項訓練',
            '觀看高手的遊玩影片學習技巧',
            '保持耐心，突破需要時間和毅力',
            '適當休息，避免過度練習造成疲勞'
        ];
    }

    const levelTips = {
        morning: '新手友好區域，重點學習基礎',
        daily: '穩步提升，追求精確和穩定',
        night: '高手挑戰，需要技術和經驗並重',
        hell: '頂尖玩家的領域，每一個等級都是巨大的挑戰',
        random: '保持開放心態，享受各種難度的樂趣'
    };

    const tipIndex = chart.level % baseTips.length;
    return `${baseTips[tipIndex]}\n💡 ${levelTips[type] || '享受遊戲過程！'}`;
}