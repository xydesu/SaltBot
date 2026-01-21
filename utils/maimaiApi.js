const https = require('https');

/**
 * 獲取 maimai DX 樂曲資料庫
 * @returns {Promise<Array>} 樂曲列表
 */
async function getMaimaiSongs() {
    return new Promise((resolve, reject) => {
        const url = 'https://otoge-db.net/maimai/data/music-ex.json';

        const request = https.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP 錯誤: ${res.statusCode}`));
                return;
            }

            let data = '';
            let totalSize = 0;

            res.on('data', (chunk) => {
                data += chunk;
                totalSize += chunk.length;
            });

            res.on('end', () => {
                try {
                    if (data.length === 0) {
                        reject(new Error('接收到空數據'));
                        return;
                    }

                    const rawSongs = JSON.parse(data);
                    if (!Array.isArray(rawSongs)) {
                        reject(new Error('API 返回的不是數組格式'));
                        return;
                    }

                    const convertedSongs = rawSongs.map(song => convertSongData(song));
                    resolve(convertedSongs);
                } catch (error) {
                    reject(new Error(`JSON 解析失敗: ${error.message}`));
                }
            });
        });

        request.on('error', (error) => {
            reject(new Error(`HTTP 請求失敗: ${error.message}`));
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('請求超時'));
        });

        request.setTimeout(10000);
    });
}

/**
 * 將 API 數據轉換為內部格式
 * @param {Object} apiSong API 返回的歌曲數據
 * @returns {Object} 轉換後的歌曲數據
 */
function convertSongData(apiSong) {
    // 難度轉換映射
    const difficultyMap = {
        'bas': 'basic',
        'adv': 'advanced',
        'exp': 'expert',
        'mas': 'master',
        'remas': 'remaster',
        'dx_bas': 'dx_basic',
        'dx_adv': 'dx_advanced',
        'dx_exp': 'dx_expert',
        'dx_mas': 'dx_master',
        'dx_remas': 'dx_remaster'
    };

    // 類型轉換映射
    const genreMap = {
        'POPS＆アニメ': 'pops',
        'niconico＆ボーカロイド': 'niconico',
        '東方Project': 'touhou',
        'ゲーム＆バラエティ': 'game',
        'maimai': 'maimai',
        'オンゲキ＆CHUNITHM': 'ongeki'
    };

    // 構建譜面資訊
    const charts = [];
    const difficulties = ['bas', 'adv', 'exp', 'mas', 'remas', 'dx_bas', 'dx_adv', 'dx_exp', 'dx_mas', 'dx_remas'];

    for (const diff of difficulties) {
        let levelKey, constantKey, notesKey, designerKey;

        // DX 譜面的欄位格式不同
        if (diff.startsWith('dx_')) {
            const dxDiff = diff; // dx_bas, dx_adv, etc.
            levelKey = `dx_lev_${diff.slice(3)}`; // dx_lev_bas, dx_lev_adv, etc.
            constantKey = `${levelKey}_i`;
            notesKey = `${levelKey}_notes`;
            designerKey = `${levelKey}_designer`;
        } else {
            levelKey = `lev_${diff}`;
            constantKey = `${levelKey}_i`;
            notesKey = `${levelKey}_notes`;
            designerKey = `${levelKey}_designer`;
        }

        if (apiSong[levelKey]) {
            let level = apiSong[levelKey];
            let constant = apiSong[constantKey] || null;
            let notes = apiSong[notesKey] || null;
            let noteDesigner = apiSong[designerKey] || null;

            // 處理等級格式 (如 "13+" -> 13.7)
            const numLevel = parseFloat(level.toString().replace('+', '.7'));

            // 處理定數 - 確保正確轉換為數字
            let parsedConstant = null;
            if (constant !== null && constant !== undefined && constant !== '') {
                parsedConstant = parseFloat(constant);
                // 如果解析失敗，設為 null
                if (isNaN(parsedConstant)) {
                    parsedConstant = null;
                }
            }

            charts.push({
                difficulty: difficultyMap[diff] || diff,
                level: level,
                levelNum: numLevel,
                constant: parsedConstant,
                notes: notes ? parseInt(notes) : null,
                noteDesigner: noteDesigner
            });
        }
    }

    return {
        title: apiSong.title || 'Unknown',
        titleKana: apiSong.title_kana || '',
        artist: apiSong.artist || 'Unknown',
        genre: genreMap[apiSong.catcode] || 'other',
        genreName: apiSong.catcode || 'Other',
        bpm: apiSong.bpm || '---',
        version: apiSong.version || '',
        imageUrl: apiSong.image_url || '',
        charts: charts.filter(chart => chart.level), // 只保留有效的譜面
        releaseDate: apiSong.date_added || '',
        wikiUrl: apiSong.wiki_url || ''
    };
}

/**
 * 計算 Levenshtein 編輯距離
 * @param {string} a 字串 A
 * @param {string} b 字串 B
 * @returns {number} 編輯距離
 */
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // 初始化矩陣
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // 填充矩陣
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替換
                    matrix[i][j - 1] + 1,     // 插入
                    matrix[i - 1][j] + 1      // 刪除
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * 計算模糊匹配分數
 * @param {string} text 目標文本
 * @param {string} query 查詢關鍵字
 * @returns {number} 分數 (0-1)
 */
function calculateFuzzyScore(text, query) {
    if (!text || !query) return 0;

    // 轉換為小寫進行比較
    const str = text.toLowerCase();
    const q = query.toLowerCase();

    // 情況 1: 完全匹配 (最高分)
    if (str === q) return 1.0;

    // 情況 2: 包含匹配 (次高分)
    if (str.includes(q)) {
        // 基礎分 0.8，根據匹配長度佔比給予額外加分 (最多 0.2)
        return 0.8 + (q.length / str.length) * 0.2;
    }

    // 情況 3: 全文模糊匹配 (基於編輯距離)
    const distance = levenshteinDistance(str, q);
    const maxLength = Math.max(str.length, q.length);
    const fullSimilarity = 1 - (distance / maxLength);

    // 情況 4: 單詞模糊匹配 (針對長標題中的單字搜尋帶有錯字的情況)
    // 例如: "Pandroa" (錯字) 搜尋 "PANDORA PARADOXXX"
    let maxTokenScore = 0;

    // 只有當查詢字串比目標字串短的時候才嘗試單詞匹配
    if (q.length < str.length) {
        // 根據常見分隔符分割單詞
        const tokens = str.split(/[\s\-_:;,.+]+/);

        for (const token of tokens) {
            // 跳過太短的單詞 (除非查詢也很短)
            if (token.length < 2 && q.length > 2) continue;

            const tokenDist = levenshteinDistance(token, q);
            const tokenMaxLen = Math.max(token.length, q.length);
            const tokenSim = 1 - (tokenDist / tokenMaxLen);

            if (tokenSim > maxTokenScore) {
                maxTokenScore = tokenSim;
            }
        }
    }

    // 取全文匹配和單詞匹配的最大值
    const finalScore = Math.max(fullSimilarity, maxTokenScore);

    // 設定最低相似度門檻，避免關聯性太低的結果
    // 給予 0.6 的權重係數，確保模糊匹配分數低於包含匹配
    // 降低門檻到 0.35 以容忍更多錯字 (例如 Fredom -> Freedom)
    if (finalScore > 0.35) {
        return finalScore * 0.6;
    }

    return 0;
}

/**
 * 搜尋歌曲 (支援模糊搜尋)
 * @param {Array} songs 歌曲列表
 * @param {string} query 搜尋關鍵字
 * @param {string} searchType 搜尋類型 ('title', 'artist', 'all')
 * @returns {Array} 搜尋結果 (已排序)
 */
function searchSongs(songs, query, searchType = 'all') {
    const scoredSongs = songs.map(song => {
        let maxScore = 0;

        // 檢查函數
        const check = (text) => {
            if (text) {
                const score = calculateFuzzyScore(text.toString(), query);
                if (score > maxScore) maxScore = score;
            }
        };

        // 根據搜尋類型計算分數
        if (searchType === 'title' || searchType === 'all') {
            check(song.title);
            check(song.titleKana);
        }

        if (searchType === 'artist' || searchType === 'all') {
            check(song.artist);
        }

        // 如果是別名或其他欄位也可以在這裡加入檢查

        return { song, score: maxScore };
    });

    // 過濾並排序
    // 門檻值設為 0.3，排除相關性太低的結果
    return scoredSongs
        .filter(item => item.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .map(item => item.song);
}

/**
 * 隨機選擇歌曲
 * @param {Array} songs 歌曲列表
 * @param {Object} filters 篩選條件
 * @returns {Object|null} 隨機選中的歌曲
 */
function getRandomSong(songs, filters = {}) {
    let filteredSongs = [...songs];

    // 按難度篩選
    if (filters.difficulty) {
        filteredSongs = filteredSongs.filter(song =>
            song.charts.some(chart => chart.difficulty === filters.difficulty));
    }

    // 按等級篩選
    if (filters.level) {
        const targetLevel = parseFloat(filters.level.toString().replace('+', '.7'));
        filteredSongs = filteredSongs.filter(song =>
            song.charts.some(chart => Math.abs(chart.levelNum - targetLevel) < 0.1));
    }

    // 按類型篩選
    if (filters.genre) {
        filteredSongs = filteredSongs.filter(song => song.genre === filters.genre);
    }

    if (filteredSongs.length === 0) {
        return null;
    }

    return filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
}

/**
 * 獲取遊戲統計資訊
 * @param {Array} songs 歌曲列表
 * @returns {Object} 統計資訊
 */
async function getGameStats() {
    const songs = await getMaimaiSongs();
    const totalSongs = songs.length;

    // 計算總譜面數
    let totalCharts = 0;
    const difficultyCount = {};
    const genreCount = {};
    let totalBpm = 0;
    let validBpmCount = 0;
    let maxNotes = 0;
    let maxNotesSong = null;
    let highestLevel = 0;
    let highestLevelSong = null;

    songs.forEach(song => {
        totalCharts += song.charts.length;

        // 統計難度分佈
        song.charts.forEach(chart => {
            const diffKey = chart.difficulty.replace('dx_', '');
            difficultyCount[diffKey] = (difficultyCount[diffKey] || 0) + 1;

            // 找最高等級
            if (chart.levelNum > highestLevel) {
                highestLevel = chart.levelNum;
                highestLevelSong = song;
            }

            // 找最多 Note
            if (chart.notes && chart.notes > maxNotes) {
                maxNotes = chart.notes;
                maxNotesSong = song;
            }
        });

        // 統計類型分佈
        genreCount[song.genre] = (genreCount[song.genre] || 0) + 1;

        // 計算平均 BPM
        const bpm = parseFloat(song.bpm);
        if (!isNaN(bpm)) {
            totalBpm += bpm;
            validBpmCount++;
        }
    });

    const avgBpm = validBpmCount > 0 ? Math.round(totalBpm / validBpmCount) : 0;

    // 格式化難度分佈
    const difficultyDistribution = Object.entries(difficultyCount)
        .map(([diff, count]) => `${getDifficultyEmoji(diff)} ${diff.toUpperCase()}: ${count}`)
        .join('\n') || '無資料';

    // 格式化類型分佈
    const genreDistribution = Object.entries(genreCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8) // 限制顯示數量
        .map(([genre, count]) => `${getGenreEmoji(genre)} ${getGenreName(genre)}: ${count}`)
        .join('\n') || '無資料';

    // 等級統計 (簡化版)
    const levelStats = `最高等級: Lv.${highestLevel} | 最多Notes: ${maxNotes}`;

    return {
        totalSongs,
        totalCharts,
        averageBPM: avgBpm,
        difficultyDistribution,
        genreDistribution,
        levelStats,
        hardestSong: highestLevelSong ? {
            title: highestLevelSong.title,
            artist: highestLevelSong.artist,
            level: highestLevel
        } : null,
        mostNotesSong: maxNotesSong ? {
            title: maxNotesSong.title,
            notes: maxNotes
        } : null
    };
}

// 輔助函數
function getDifficultyEmoji(difficulty) {
    const emojis = {
        basic: '🟢',
        advanced: '🟡',
        expert: '🔴',
        master: '🟣',
        remaster: '⚪'
    };
    return emojis[difficulty] || '⚫';
}

function getGenreEmoji(genre) {
    const emojis = {
        pops: '🎵',
        niconico: '🎮',
        touhou: '🎯',
        game: '🎪',
        maimai: '🎼',
        ongeki: '🌟',
        other: '🎵'
    };
    return emojis[genre] || '🎵';
}

function getGenreName(genre) {
    const names = {
        pops: 'POPS & ANIME',
        niconico: 'niconico & VOCALOID',
        touhou: '東方Project',
        game: 'GAME & VARIETY',
        maimai: 'maimai',
        ongeki: 'オンゲキ & CHUNITHM',
        other: 'Other'
    };
    return names[genre] || genre;
}

function formatConstant(constant) {
    if (constant === null || constant === undefined) {
        return null;
    }
    // 確保顯示至少一位小數
    return Number(constant).toFixed(1);
}

module.exports = {
    getMaimaiSongs,
    convertSongData,
    searchSongs,
    getRandomSong,
    getGameStats,
    formatConstant,
    getGenreName,
    getGenreEmoji,
    getDifficultyEmoji
};
