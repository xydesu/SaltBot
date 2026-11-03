const { SlashCommandBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType, MessageFlags } = require('discord.js');
const axios = require('axios');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// 忽略 SSL 憑證驗證
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const fontPath = path.join(__dirname, '../../assets/fonts');
const spritesDir = path.join(__dirname, '../../assets/sprites');

// 註冊字體
try {
    const segaMaruPath = path.join(fontPath, 'SEGAMaruGothicDB.ttf');
    if (fs.existsSync(segaMaruPath)) {
        registerFont(segaMaruPath, { family: 'SEGAMaruGothic' });
        console.log('✅ 成功註冊 SEGAMaruGothic 字體 (KOP)');
    }

    const notoSansCJKPath = path.join(fontPath, 'NotoSansCJK-Regular.ttf');
    if (fs.existsSync(notoSansCJKPath)) {
        registerFont(notoSansCJKPath, { family: 'Noto Sans CJK' });
        console.log('✅ 成功註冊 Noto Sans CJK 字體 (KOP)');
    }
} catch (error) {
    console.log('字體註冊警告 (KOP):', error.message);
}

// 圖片快取池
const spriteCache = new Map();

async function getCachedSprite(name) {
    if (!spriteCache.has(name)) {
        const filePath = path.join(spritesDir, name);
        if (fs.existsSync(filePath)) {
            spriteCache.set(name, await loadImage(filePath));
        } else {
            try {
                const url = `https://maimaidx.jp/maimai-mobile/img/ranking/${name}`;
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
                fs.writeFileSync(filePath, res.data);
                spriteCache.set(name, await loadImage(filePath));
            } catch (err) {
                return null;
            }
        }
    }
    return spriteCache.get(name);
}

// KOP 8th 官方排名 JSON 端點
const KOP_URLS = {
    jp: 'https://maimai.sega.jp/kop8th/json/maimai/maimai_scoreattack_ranking.json',
    intl: 'https://maimai.sega.jp/kop8th/json/maimai_itr/maimai_scoreattack_ranking.json'
};

const OFFICIAL_PAGES = {
    jp: 'https://maimai.sega.jp/kop8th/maimai/ranking/',
    intl: 'https://maimai.sega.com/kop8th/maimai_itr_zh/ranking/'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('maimai-kop')
        .setDescription('查看 maimai DX KOP 8th 錦標賽排行榜')
        .addStringOption(option =>
            option.setName('server')
                .setDescription('選擇伺服器地區')
                .setRequired(false)
                .addChoices(
                    { name: '🇯🇵 JP (日本)', value: 'jp' },
                    { name: '🌍 Intl (國際)', value: 'intl' }
                ))
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply();

        const progressMessages = [];
        const serverChoice = interaction.options.getString('server') || 'jp';
        const serverName = serverChoice === 'jp' ? '🇯🇵 JP (日本)' : '🌍 Intl (國際)';
        const officialUrl = OFFICIAL_PAGES[serverChoice] || OFFICIAL_PAGES.jp;

        try {
            progressMessages.push(`🔄 正在從 KOP 8th 官網獲取排行榜資料 (${serverName})...`);
            await interaction.editReply({
                content: progressMessages.join('\n')
            });

            const rankingData = await fetchKopRanking(serverChoice);

            if (!rankingData || !rankingData.ranking || rankingData.ranking.length === 0) {
                await interaction.editReply({
                    content: progressMessages.join('\n') + '\n❌ 無法獲取排行榜資料，官方網站可能維護中。'
                });
                return;
            }

            progressMessages.push(`🎨 正在生成前 ${Math.min(rankingData.ranking.length, 20)} 名玩家排行榜圖片...`);
            await interaction.editReply({
                content: progressMessages.join('\n')
            });

            // 生成排行榜圖片
            const imageBuffer = await generateRankingImage(rankingData, serverChoice);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'kop-ranking.png' });

            let replyContent = `🏆 **maimai DX KOP 8th 錦標賽排行榜** (${serverName})\n`;
            replyContent += `📊 顯示前 ${Math.min(rankingData.ranking.length, 20)} 名玩家\n`;
            if (rankingData.update) {
                replyContent += `⏰ 官方更新時間: \`${rankingData.update}\`\n`;
            }
            replyContent += `🔗 [查看官方排行榜網頁](<${officialUrl}>)`;

            await interaction.editReply({
                content: replyContent,
                files: [attachment],
                flags: MessageFlags.SuppressEmbeds
            });

        } catch (error) {
            console.error('KOP 排行榜指令執行錯誤:', error);
            await interaction.editReply({
                content: progressMessages.join('\n') + '\n❌ 獲取排行榜時發生錯誤，請稍後再試。'
            });
        }
    },
};

// 獲取並整理官方 KOP 8th 排行榜資料
async function fetchKopRanking(serverChoice = 'jp') {
    const targetUrl = KOP_URLS[serverChoice] || KOP_URLS.jp;
    const response = await axios.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
    });

    const rawData = response.data;
    const rawRanking = rawData.ranking || rawData.rankingList || [];

    const ranking = rawRanking.map(item => {
        const rank = parseInt(item.rank, 10);
        const scoreNum = parseInt(item.score, 10);
        const percentage = !isNaN(scoreNum) ? (scoreNum * 0.0001).toFixed(4) + '%' : '--';
        const dxScore = parseInt(item.subScore, 10);
        const scoreFormatted = !isNaN(dxScore) ? dxScore.toLocaleString() : '--';

        // 依據登錄時間判斷時間標籤色彩
        let dateType = 'default';
        if (item.recordDate) {
            const recordTime = new Date(item.recordDate.replace(/\//g, '-')).getTime();
            const now = Date.now();
            const diffHours = (now - recordTime) / (1000 * 60 * 60);
            if (diffHours <= 24) {
                dateType = '1day';
            } else if (diffHours <= 24 * 7) {
                dateType = '7day';
            }
        }

        return {
            rank,
            playerName: item.userName,
            dateTime: item.recordDate,
            dateType,
            percentage,
            score: dxScore,
            scoreFormatted
        };
    });

    return {
        update: rawData.update,
        ranking
    };
}

// 根據 maimai DX 官方樣式生成排行榜圖片
async function generateRankingImage(data, serverChoice = 'jp') {
    const allPlayers = (data.ranking || []).slice(0, 20);

    const width = 480;
    const headerHeight = 53.4;
    const topBlockHeight = 63.6;
    const normalBlockHeight = 63.6;
    const blockMargin = 5;

    let totalHeight = headerHeight + 20;

    for (let i = 0; i < allPlayers.length; i++) {
        const isTopThree = allPlayers[i].rank <= 3;
        totalHeight += isTopThree ? topBlockHeight : normalBlockHeight;
        totalHeight += blockMargin;

        // 計算資格線高度
        if (serverChoice === 'jp' && (allPlayers[i].rank === 7 || allPlayers[i].rank === 15)) {
            totalHeight += 60;
        } else if (serverChoice === 'intl' && allPlayers[i].rank === 2) {
            totalHeight += 60;
        }
    }
    totalHeight += 60;

    const scale = 2;
    const canvas = createCanvas(width * scale, totalHeight * scale);
    const ctx = canvas.getContext('2d');

    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 官方主題藍色背景
    ctx.fillStyle = '#51bcf3';
    ctx.fillRect(0, 0, width, totalHeight);

    const containerX = 15;
    const containerY = 15;
    const containerWidth = 450;

    const titleX = containerX + 15;
    const titleY = containerY + 15;

    const lineImage = await getCachedSprite('line_02.png');
    const headerImage = await getCachedSprite('back_rank_top.png');

    let currentY = titleY;

    // 標題分隔線
    if (lineImage) {
        const lineWidth = 450;
        const lineHeight = 9.38333;
        ctx.drawImage(lineImage, containerX + 10, currentY, lineWidth - containerX - 10, lineHeight);
        currentY += lineHeight + 15;
    } else {
        ctx.fillStyle = '#ddd';
        ctx.fillRect(containerX + 15, currentY, containerWidth - 30, 2);
        currentY += 17;
    }

    // 標題文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px "SEGAMaruGothic", Meiryo, sans-serif';
    ctx.textAlign = 'left';

    const titleText = serverChoice === 'jp' 
        ? '「全国エリア」オンライン予選ランキング'
        : '「International Area」Online qualifying ranking';
    ctx.fillText(titleText, titleX, currentY + 5);

    // 更新時間文字
    ctx.font = 'bold 12px "SEGAMaruGothic", Meiryo, sans-serif';
    ctx.fillStyle = '#fff';
    const updateTimeStr = data.update || new Date().toLocaleString('ja-JP');
    const updateText = serverChoice === 'jp' ? `${updateTimeStr} 更新` : `${updateTimeStr} update`;
    ctx.fillText(updateText, titleX, currentY + 25);

    if (headerImage) {
        ctx.drawImage(headerImage, 214, containerY + 40.5, 236, 39);
    }

    currentY += 40;

    // 繪製前 20 名排名列
    for (let i = 0; i < allPlayers.length; i++) {
        const player = allPlayers[i];
        const isTopThree = player.rank <= 3;
        const blockHeight = isTopThree ? topBlockHeight : normalBlockHeight;

        const marginTop = isTopThree && i === 0 ? 0 : blockMargin;
        currentY += marginTop;

        await drawMaimaiStyleRow(ctx, player, currentY, containerWidth, blockHeight, isTopThree);
        currentY += blockHeight;

        // 日本版第 7 名：全国決勝大会資格線
        if (serverChoice === 'jp' && player.rank === 7) {
            currentY += 15;
            currentY += 14.4;
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px "SEGAMaruGothic", Meiryo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('ここまでの方は全国決勝大会に出場する権利が与えられます。', containerX + containerWidth - 15, currentY);
            currentY += 14.4;

            if (lineImage) {
                const lineWidth = 450;
                const lineHeight = lineImage.height * (lineWidth / lineImage.width);
                ctx.drawImage(lineImage, containerX + 10, currentY, lineWidth - containerX - 10, lineHeight);
                currentY += lineHeight + 10;
            } else {
                ctx.fillStyle = '#ddd';
                ctx.fillRect(containerX + 15, currentY, containerWidth - 30, 2);
                currentY += 15;
            }
            ctx.restore();
        } else if (serverChoice === 'intl' && player.rank === 2) {
            // 國際版第 2 名：國際決賽資格線
            currentY += 15;
            currentY += 14.4;
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px "SEGAMaruGothic", Meiryo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('Players up to here, will have the rights to join the International Ver.', containerX + containerWidth - 15, currentY);
            currentY += 14.4;
            ctx.fillText('Final in Japan.', containerX + containerWidth - 15, currentY);
            currentY += 14.4;

            if (lineImage) {
                const lineWidth = 450;
                const lineHeight = lineImage.height * (lineWidth / lineImage.width);
                ctx.drawImage(lineImage, containerX + 10, currentY, lineWidth - containerX - 10, lineHeight);
                currentY += lineHeight + 10;
            } else {
                ctx.fillStyle = '#ddd';
                ctx.fillRect(containerX + 15, currentY, containerWidth - 30, 2);
                currentY += 15;
            }
            ctx.restore();
        }

        // 日本版第 15 名：LCQ 最終預選資格線
        if (serverChoice === 'jp' && player.rank === 15) {
            currentY += 15;
            currentY += 14.4;
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px "SEGAMaruGothic", Meiryo, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('ここまでの方はLCQ（最終予選）に出場する権利が与えられます。', containerX + containerWidth - 15, currentY);
            currentY += 14.4;

            if (lineImage) {
                const lineWidth = 450;
                const lineHeight = lineImage.height * (lineWidth / lineImage.width);
                ctx.drawImage(lineImage, containerX + 10, currentY, lineWidth - containerX - 10, lineHeight);
                currentY += lineHeight + 10;
            } else {
                ctx.fillStyle = '#ddd';
                ctx.fillRect(containerX + 15, currentY, containerWidth - 30, 2);
                currentY += 15;
            }
            ctx.restore();
        }
    }

    return canvas.toBuffer('image/png');
}

// 繪製單一排行榜項目列
async function drawMaimaiStyleRow(ctx, player, y, width, height, isTopThree) {
    const x = 30;
    const actualWidth = width - 30;

    ctx.save();
    if (isTopThree) {
        // 前三名彩虹漸層外框背景
        const cssAngleDeg = -30;
        const angleDeg = 90 - cssAngleDeg;
        const angleRad = (angleDeg * Math.PI) / 180;

        const centerX = x + actualWidth / 2;
        const centerY = y + height / 2;
        const halfLen = Math.hypot(actualWidth, height);

        const dx = Math.cos(angleRad);
        const dy = Math.sin(angleRad);

        const x0 = centerX - dx * halfLen / 2;
        const y0 = centerY - dy * halfLen / 2;
        const x1 = centerX + dx * halfLen / 2;
        const y1 = centerY + dy * halfLen / 2;

        const rainbowGradient = ctx.createLinearGradient(x0, y1, x1, y0);
        rainbowGradient.addColorStop(0.00, '#ff6d51');
        rainbowGradient.addColorStop(0.41, '#ff6d51');
        rainbowGradient.addColorStop(0.41, '#ffa034');
        rainbowGradient.addColorStop(0.47, '#ffa034');
        rainbowGradient.addColorStop(0.47, '#ffe839');
        rainbowGradient.addColorStop(0.53, '#ffe839');
        rainbowGradient.addColorStop(0.53, '#a8ef3e');
        rainbowGradient.addColorStop(0.59, '#a8ef3e');
        rainbowGradient.addColorStop(0.59, '#3fc6fc');
        rainbowGradient.addColorStop(1.00, '#3fc5fb');

        ctx.fillStyle = rainbowGradient;
    } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    }

    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';

    roundRect(ctx, x, y, actualWidth, height, 5);
    ctx.fill();
    ctx.restore();

    ctx.shadowColor = 'transparent';

    const innerX = x + 4;
    const innerY = y + 4;
    const innerWidth = actualWidth - 8;
    const innerHeight = height - 8;

    if (isTopThree) {
        ctx.fillStyle = '#f5f8fb';
    } else {
        ctx.fillStyle = '#eff5fb';
    }

    ctx.save();
    roundRect(ctx, innerX, innerY, innerWidth, innerHeight, 5);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const rankBlockWidth = 70;
    const rankBlockHeight = 36;
    const rankX = innerX;
    const rankY = innerY + 10;

    await drawRankingImages(ctx, player, rankX, rankY, rankBlockWidth, rankBlockHeight);

    const nameX = innerX + rankBlockWidth + 10;
    const nameY = innerY + 20 + 15;

    ctx.fillStyle = '#000';
    ctx.font = 'bold 15px "SEGAMaruGothic", "Noto Sans CJK", Meiryo, sans-serif';
    ctx.textAlign = 'left';
    const playerName = player.playerName || 'Unknown';

    const maxNameWidth = innerWidth - rankBlockWidth - 20 - 120;
    let displayName = playerName;
    while (ctx.measureText(displayName).width > maxNameWidth && displayName.length > 1) {
        displayName = displayName.slice(0, -1);
    }
    if (displayName !== playerName && displayName.length < playerName.length) displayName += '...';

    ctx.fillText(displayName, nameX, nameY);

    // 時間標籤
    if (player.dateTime) {
        const dateBlockWidth = 116;
        const dateBlockHeight = 11;
        const dateX = innerX + innerWidth - dateBlockWidth + 2;
        const dateY = innerY - 2;

        let bgColor = '#26b3fc';
        if (player.dateType === '1day') {
            bgColor = '#ff2900';
        } else if (player.dateType === '7day') {
            bgColor = '#ffb200';
        }

        ctx.fillStyle = bgColor;
        ctx.save();
        roundRect(ctx, dateX, dateY, dateBlockWidth, dateBlockHeight, 5);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#fff';
        ctx.font = '10px "SEGAMaruGothic", Meiryo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.dateTime, dateX + dateBlockWidth / 2, dateY + dateBlockHeight / 2 + 4);
    }

    // 分數區域
    const scoreX = innerX + innerWidth - 10;
    const percentageY = innerY + 15 + 16;

    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px "SEGAMaruGothic", Meiryo, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(player.percentage || '--', scoreX, percentageY);

    ctx.font = '14px "SEGAMaruGothic", Meiryo, sans-serif';
    ctx.fillStyle = '#000';
    const scoreY = percentageY + 16;
    ctx.fillText(player.scoreFormatted || '--', scoreX, scoreY);
}

// 繪製排名圖示或數字
async function drawRankingImages(ctx, player, x, y, width, height) {
    const rank = player.rank;
    try {
        if (rank === 1) {
            const img = await getCachedSprite('rank_first.png');
            if (img) {
                const targetW = 40, targetH = 36;
                const scale = Math.min((height * 0.85) / targetH, 1);
                const w = targetW * scale, h = targetH * scale;
                ctx.drawImage(img, x + (width - w) / 2, y + (height - h) / 2, w, h);
                return;
            }
        } else if (rank === 2) {
            const img = await getCachedSprite('rank_second.png');
            if (img) {
                const targetW = 40, targetH = 36;
                const scale = Math.min((height * 0.85) / targetH, 1);
                const w = targetW * scale, h = targetH * scale;
                ctx.drawImage(img, x + (width - w) / 2, y + (height - h) / 2, w, h);
                return;
            }
        } else if (rank === 3) {
            const img = await getCachedSprite('rank_third.png');
            if (img) {
                const targetW = 40, targetH = 36;
                const scale = Math.min((height * 0.85) / targetH, 1);
                const w = targetW * scale, h = targetH * scale;
                ctx.drawImage(img, x + (width - w) / 2, y + (height - h) / 2, w, h);
                return;
            }
        } else {
            // 普通數字排名
            const digits = rank.toString().split('');
            const imgs = [];
            for (const d of digits) {
                const img = await getCachedSprite(`rank_num_${d}.png`);
                if (img) imgs.push(img);
            }
            if (imgs.length === digits.length) {
                const targetW = 20, targetH = 24;
                const scale = Math.min((height * 0.85) / targetH, 1);
                const w = targetW * scale, h = targetH * scale;
                const imgSpacing = 1;
                const totalW = imgs.length * w + (imgs.length - 1) * imgSpacing;
                let curX = x + (width - totalW) / 2;
                for (const img of imgs) {
                    ctx.drawImage(img, curX, y + (height - h) / 2, w, h);
                    curX += w + imgSpacing;
                }
                return;
            }
        }
    } catch (e) {
        console.warn('drawRankingImages error:', e.message);
    }
    drawRankText(ctx, rank, x, y, width, height);
}

// 備用排名文字渲染
function drawRankText(ctx, rank, x, y, width, height) {
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px "SEGAMaruGothic", Meiryo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rank, x + width / 2, y + height / 2 + 6);
}

// 繪製圓角矩形
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
