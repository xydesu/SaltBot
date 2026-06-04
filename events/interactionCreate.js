const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 處理斜線命令
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`找不到命令 ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('執行命令時發生錯誤:', error);
                
                const errorMessage = {
                    content: '執行此命令時發生錯誤！',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        
        // 處理按鈕互動
        if (interaction.isButton()) {
            // 石頭剪刀布按鈕處理
            if (interaction.customId.startsWith('rps_')) {
                const choice = interaction.customId.replace('rps_', '');
                const rpsCommand = require('../commands/games/rps.js');
                const result = rpsCommand.playRPS(choice);
                const embed = rpsCommand.createResultEmbed(choice, result.botChoice, result.outcome, interaction.user);
                
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
            
            // 字母猜測按鈕處理已移除 - 改為訊息偵測
            
            // 音遊歌曲猜謎按鈕處理
            if (interaction.customId.startsWith('song_hint_')) {
                const gameId = interaction.customId.replace('song_hint_', '');
                const guessRhythmGame = require('../commands/games/guess-rhythm-song.js');
                const game = guessRhythmGame.activeGames.get(gameId);
                
                if (!game) {
                    return await interaction.reply({
                        content: '❌ Salt 找不到這個遊戲或遊戲已經結束了にゃ！',
                        ephemeral: true
                    });
                }
                
                // 移除用戶身份檢查，讓所有人都能獲得提示
                
                // 隨機給出一首歌的提示
                const randomSong = game.songs[Math.floor(Math.random() * game.songs.length)];
                const hints = [
                    `💡 Salt 說：有一首歌的作曲家是 **${randomSong.artist}**にゃ`,
                    `💡 Salt 說：**${randomSong.hint}**にゃ`,
                    `💡 Salt 說：有一首歌名有 **${randomSong.name.length}** 個字符にゃ`
                ];
                
                const randomHint = hints[Math.floor(Math.random() * hints.length)];
                await interaction.reply({
                    content: randomHint,
                    ephemeral: true
                });
                return;
            }
            
            if (interaction.customId.startsWith('song_give_up_')) {
                const gameId = interaction.customId.replace('song_give_up_', '');
                const guessRhythmGame = require('../commands/games/guess-rhythm-song.js');
                const game = guessRhythmGame.activeGames.get(gameId);
                
                if (!game) {
                    return await interaction.reply({
                        content: '❌ Salt 找不到這個遊戲或遊戲已經結束了にゃ！',
                        ephemeral: true
                    });
                }
                
                // 移除用戶身份檢查，讓所有人都能放棄遊戲
                
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('😅 Salt 說沒關係的にゃ')
                    .setDescription(`Salt 說放棄也沒關係的にゃ～這些歌曲都很經典にゃ！`)
                    .addFields({
                        name: '🎵 答案揭曉',
                        value: game.songs.map((song, index) => `${index + 1}. **${song.name}** *(${song.game} - ${song.artist})*`).join('\n'),
                        inline: false
                    })
                    .setFooter({ text: 'Salt 說學習新歌曲也是很棒的にゃ～' })
                    .setTimestamp();
                
                // 標記遊戲為完成並刪除
                game.isComplete = true;
                guessRhythmGame.activeGames.delete(gameId);
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
            
            // 新的遊戲按鈕處理 - 猜歌按鈕
            if (interaction.customId.startsWith('guess_song_')) {
                const parts = interaction.customId.split('_');
                const songIndex = parseInt(parts[2]) - 1; // 歌曲索引 (0-4)
                const gameId = parts.slice(3).join('_'); // 重建遊戲ID
                
                const guessRhythmGame = require('../commands/games/guess-rhythm-song.js');
                const game = guessRhythmGame.activeGames.get(gameId);
                
                if (!game) {
                    return await interaction.reply({
                        content: '❌ Salt 找不到這個遊戲或遊戲已經結束了にゃ！',
                        ephemeral: true
                    });
                }
                
                // 移除用戶身份檢查，讓所有人都能猜歌曲
                
                if (songIndex < 0 || songIndex >= game.songs.length) {
                    return await interaction.reply({
                        content: '❌ Salt 說這個歌曲編號不存在にゃ！',
                        ephemeral: true
                    });
                }
                
                const targetSong = game.songs[songIndex];
                
                // 創建模態框讓用戶輸入答案
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                
                const modal = new ModalBuilder()
                    .setCustomId(`song_answer_${songIndex}_${gameId}`)
                    .setTitle(`猜第 ${songIndex + 1} 首歌 - ${targetSong.game}`);
                
                const songInput = new TextInputBuilder()
                    .setCustomId('song_name')
                    .setLabel(`請輸入第 ${songIndex + 1} 首歌的歌名`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('輸入完整的歌曲名稱...')
                    .setRequired(true)
                    .setMaxLength(100);
                
                const firstActionRow = new ActionRowBuilder().addComponents(songInput);
                modal.addComponents(firstActionRow);
                
                await interaction.showModal(modal);
                return;
            }
            
            // 遊戲提示按鈕處理
            if (interaction.customId.startsWith('game_hint_')) {
                const gameId = interaction.customId.replace('game_hint_', '');
                const guessRhythmGame = require('../commands/games/guess-rhythm-song.js');
                const game = guessRhythmGame.activeGames.get(gameId);
                
                if (!game) {
                    return await interaction.reply({
                        content: '❌ Salt 找不到這個遊戲或遊戲已經結束了にゃ！',
                        ephemeral: true
                    });
                }
                
                // 移除用戶身份檢查，讓所有人都能獲得提示
                
                // 隨機給出一首歌的提示
                const randomSong = game.songs[Math.floor(Math.random() * game.songs.length)];
                const hints = [
                    `💡 Salt 說：有一首歌的作曲家是 **${randomSong.artist}**にゃ`,
                    `💡 Salt 說：**${randomSong.hint}**にゃ`,
                    `💡 Salt 說：有一首歌名有 **${randomSong.name.length}** 個字符にゃ`
                ];
                
                const randomHint = hints[Math.floor(Math.random() * hints.length)];
                await interaction.reply({
                    content: randomHint,
                    ephemeral: true
                });
                return;
            }
            
            // 遊戲放棄按鈕處理
            if (interaction.customId.startsWith('game_give_up_')) {
                const gameId = interaction.customId.replace('game_give_up_', '');
                const guessRhythmGame = require('../commands/games/guess-rhythm-song.js');
                const game = guessRhythmGame.activeGames.get(gameId);
                
                if (!game) {
                    return await interaction.reply({
                        content: '❌ Salt 找不到這個遊戲或遊戲已經結束了にゃ！',
                        ephemeral: true
                    });
                }
                
                // 移除用戶身份檢查，讓所有人都能放棄遊戲
                
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('😅 Salt 說沒關係的にゃ')
                    .setDescription(`Salt 說放棄也沒關係的にゃ～這些歌曲都很經典にゃ！`)
                    .addFields({
                        name: '🎵 答案揭曉',
                        value: game.songs.map((song, index) => `${index + 1}. **${song.name}** *(${song.game} - ${song.artist})*`).join('\n'),
                        inline: false
                    })
                    .setFooter({ text: 'Salt 說學習新歌曲也是很棒的にゃ～' })
                    .setTimestamp();
                
                // 標記遊戲為完成並刪除
                game.isComplete = true;
                guessRhythmGame.activeGames.delete(gameId);
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
            
            // 帳號密碼儲存按鈕處理
            if (interaction.customId.startsWith('maimai_creds_save_')) {
                const targetUserId = interaction.customId.replace('maimai_creds_save_', '');
                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({ content: '❌ 這不是你的按鈕にゃ！', ephemeral: true });
                }
                const userSessions = require('../utils/userSessions');
                const { segaId, password } = userSessions.getSession(targetUserId, 'INT').getCredentials();
                if (!segaId || !password) {
                    return interaction.reply({ content: '❌ 找不到帳號資料，請重新執行 `/maimai-login` にゃ', ephemeral: true });
                }
                const db = require('../utils/database');
                db.saveCredentials(targetUserId, segaId, password);
                await interaction.update({
                    content: '✅ 帳號密碼已安全儲存にゃ！下次使用 `/maimai-login` 時將會自動登入にゃ～',
                    embeds: [],
                    components: [],
                });
                return;
            }

            if (interaction.customId.startsWith('maimai_creds_nosave_')) {
                const targetUserId = interaction.customId.replace('maimai_creds_nosave_', '');
                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({ content: '❌ 這不是你的按鈕にゃ！', ephemeral: true });
                }
                await interaction.update({
                    content: '✅ 了解にゃ！帳號密碼不會被儲存にゃ～',
                    embeds: [],
                    components: [],
                });
                return;
            }

            if (interaction.customId.startsWith('maimai_creds_delete_')) {
                const targetUserId = interaction.customId.replace('maimai_creds_delete_', '');
                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({ content: '❌ 這不是你的按鈕にゃ！', ephemeral: true });
                }
                const userSessions = require('../utils/userSessions');
                userSessions.deleteAutoLogin(targetUserId);
                await interaction.update({
                    content: '🗑️ 已儲存的帳號密碼已刪除にゃ！',
                    embeds: [],
                    components: [],
                });
                return;
            }

            // 遊玩記錄導航按鈕處理
            if (interaction.customId.startsWith('maimai_record_')) {
                // customId format: maimai_record_{action}_{userId}
                const parts = interaction.customId.split('_');
                // parts: ['maimai', 'record', action, userId]
                const action       = parts[2]; // prev | next | refresh
                const targetUserId = parts[3];
                console.log(`[maimai-record] 按鈕觸發: action=${action} targetUserId=${targetUserId} requestUserId=${interaction.user.id}`);

                if (interaction.user.id !== targetUserId) {
                    console.warn(`[maimai-record] 用戶 ${interaction.user.id} 嘗試操作他人記錄 (${targetUserId})，已拒絕`);
                    return interaction.reply({ content: '❌ 這不是你的記錄にゃ！', ephemeral: true });
                }

                const recordCommand = require('../commands/maimai/maimai-record.js');
                const cache = recordCommand.recordCache.get(targetUserId);

                if (!cache) {
                    console.warn(`[maimai-record] 找不到快取 userId=${targetUserId}，快取可能已過期`);
                    return interaction.reply({
                        content: '❌ 記錄快取已過期，請重新執行 `/maimai-record` にゃ',
                        ephemeral: true,
                    });
                }

                console.log(`[maimai-record] 快取命中 userId=${targetUserId}，目前 index=${cache.index} 共 ${cache.records.length} 筆`);
                const userSessions = require('../utils/userSessions');
                const server = userSessions.getServer(targetUserId);

                if (action === 'refresh') {
                    console.log(`[maimai-record] 開始 refresh，正在向伺服器重新請求遊玩記錄...`);
                    await interaction.deferUpdate();
                    try {
                        const session = userSessions.getSession(targetUserId);
                        const res = await session.authenticatedGet('record/');
                        console.log(`[maimai-record] refresh HTTP 回應: statusCode=${res.statusCode} bodyLength=${res.body?.length ?? 0} 字元`);
                        if (res.statusCode !== 200) {
                            console.warn(`[maimai-record] refresh 非預期狀態碼 ${res.statusCode}`);
                            return interaction.followUp({ content: '❌ 重新載入失敗にゃ', ephemeral: true });
                        }
                        const records = recordCommand.parseRecords(res.body);
                        console.log(`[maimai-record] refresh 解析結果: ${records.length} 筆記錄`);
                        if (records.length === 0) {
                            console.warn(`[maimai-record] refresh 解析後無有效記錄`);
                            return interaction.followUp({ content: '❌ 找不到遊玩記錄にゃ', ephemeral: true });
                        }
                        cache.records = records;
                        cache.index   = Math.min(cache.index, records.length - 1);
                        console.log(`[maimai-record] refresh 完成，快取更新為 ${records.length} 筆，index 調整至 ${cache.index}`);
                    } catch (err) {
                        console.error('[maimai-record refresh]', err);
                        return interaction.followUp({ content: '❌ 重新載入時發生錯誤にゃ', ephemeral: true });
                    }
                } else {
                    const prevIndex = cache.index;
                    if (action === 'prev' && cache.index > 0) {
                        cache.index--;
                    } else if (action === 'next' && cache.index < cache.records.length - 1) {
                        cache.index++;
                    }
                    console.log(`[maimai-record] 翻頁 action=${action}: ${prevIndex} -> ${cache.index}`);
                    await interaction.deferUpdate();
                }

                const { records, index } = cache;
                console.log(`[maimai-record] 顯示記錄 index=${index} title="${records[index]?.title}"`);
                const embed = recordCommand.buildRecordEmbed(records[index], index, records.length, server, interaction.user);
                const row   = recordCommand.buildNavButtons(index, records.length, targetUserId);

                return interaction.editReply({ embeds: [embed], components: [row] });
            }

            // maimai DX Widget 同步按鈕處理
            if (interaction.customId.startsWith('maimai_widget_sync_')) {
                const targetUserId = interaction.customId.replace('maimai_widget_sync_', '');
                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({ content: '❌ 這不是你的按鈕にゃ！', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });

                const userSessions = require('../utils/userSessions');
                const widgetCommand = require('../commands/maimai/maimai-widget.js');
                const server = userSessions.getServer(targetUserId);

                if (!userSessions.isLoggedIn(targetUserId)) {
                    return interaction.editReply({ content: '❌ 你尚未登入，請使用 `/maimai-login` 重新登入以進行同步にゃ！' });
                }

                const session = userSessions.getSession(targetUserId);

                try {
                    console.log(`[maimai-widget-sync] 正在為用戶 ${targetUserId} 請求玩家資料...`);
                    const res = await session.authenticatedGet('playerData/');
                    if (res.statusCode !== 200) {
                        return interaction.editReply({ content: `❌ 無法取得玩家資料，伺服器回應了狀態碼：\`${res.statusCode}\`にゃ` });
                    }

                    const playerData = widgetCommand.parsePlayerData(res.body);
                    console.log(`[maimai-widget-sync] 解析完成，開始同步至 Discord Widget Profile...`);
                    
                    await widgetCommand.syncWidget(targetUserId, playerData, server, interaction.client);

                    console.log(`[maimai-widget-sync] 用戶 ${targetUserId} 同步成功！`);
                    return interaction.editReply({ content: '✅ maimai DX 資料已成功同步至你的 Discord Profile Widget 了にゃ！🎉' });
                } catch (error) {
                    console.error('[maimai-widget-sync] 同步時發生錯誤:', error);
                    let errMsg = error.message;
                    let isScopeError = false;
                    
                    if (error.response && error.response.data) {
                        errMsg = JSON.stringify(error.response.data);
                        if (error.response.data.code === 50026 || (error.response.data.message && error.response.data.message.includes('OAuth2 scope'))) {
                            isScopeError = true;
                        }
                    }

                    if (isScopeError) {
                        return interaction.editReply({
                            content: `❌ 同步失敗にゃ！錯誤原因：\`Missing required OAuth2 scope (50026)\`\n\n` +
                                     `**💡 解決方法：**\n` +
                                     `1. 請確認您已點擊 **「授權 Widget」** 按鈕並在開啟的網頁中完成授權。\n` +
                                     `2. 若授權時出現 \`invalid_scope\` 或是此處顯示 50026，這是因為您尚未啟用該應用的 Social SDK。請至 **Discord Developer Portal** ➜ 選擇您的應用 ➜ 點入左側選單的 **Games ➜ Social SDK** 填寫並提交表單（這會立即獲得權限），之後重新點擊「授權 Widget」進行授權即可にゃ～`
                        });
                    }
                    
                    return interaction.editReply({ content: `❌ 同步失敗にゃ！錯誤原因：\`${errMsg}\`\n請確認你是否已經點擊過「授權 Widget」按鈕同意授權にゃ～` });
                }
            }

            // maimai DX Widget 客戶端輔助腳本按鈕處理
            if (interaction.customId.startsWith('maimai_widget_script_')) {
                const targetUserId = interaction.customId.replace('maimai_widget_script_', '');
                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({ content: '❌ 這不是你的按鈕にゃ！', ephemeral: true });
                }

                const { EmbedBuilder } = require('discord.js');
                const clientId = process.env.CLIENT_ID;
                const scriptText = `let _mods=webpackChunkdiscord_app.push([[Symbol()],{},e=>e.c]);webpackChunkdiscord_app.pop();
let findByProps=(...e)=>{for(let t of Object.values(_mods))try{if(!t.exports||t.exports===window)continue;if(e.every(e=>t.exports?.[e]))return t.exports;for(let r in t.exports)if(e.every(e=>t.exports?.[r]?.[e])&&"IntlMessagesProxy"!==t.exports[r][Symbol.toStringTag])return t.exports[r]}catch{}};

api = findByProps("Bo", "Cu").Bo
async function addWidget(appId) {
    id = findByProps("getCurrentUser").getCurrentUser().id;
    current_widgets = (await api.get("/users/" + id + "/profile")).body.widgets
    if (current_widgets.map(x=>x.data?.application_id).includes(appId)) {return console.log("Already in your widgets — remove it via Discord client to re-add")}
    current_widgets.unshift({"data": {"type": "application","application_id": appId}})
    await api.put({url: "/users/@me/widgets",body:{widgets: current_widgets}})
}
addWidget("${clientId}")`;

                const embed = new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle('🛠️ Discord 檔案手動新增 Widget 說明にゃ')
                    .setDescription(
                        '如果同步成功後，你的個人檔案連線中仍未出現 maimai DX 小工具，請依以下步驟手動新增：\n\n' +
                        '**💡 操作步驟：**\n' +
                        '1. 請在電腦上開啟 **網頁版 Discord** (https://discord.com/app)。\n' +
                        '2. 按下鍵盤的 **`F12`** 或 **`Ctrl + Shift + I`**，切換到 **「主控台」(Console)** 頁籤。\n' +
                        '3. 複製並貼上最下方的程式碼後按下 **`Enter`** 執行。\n' +
                        '4. 回到 Discord 個人資料頁面即可看到本應用的小工具已經成功掛載にゃ！\n\n' +
                        '**⚠️ 注意事項：**\n' +
                        '-# 執行前請確保您了解程式碼內容以策安全，此腳本僅用於向您的個人檔案清單加入本應用的 Widget 元件。'
                    )
                    .addFields({
                        name: '📋 複製以下程式碼執行：',
                        value: `\`\`\`javascript\n${scriptText}\n\`\`\``
                    });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            console.log(`按鈕被點擊: ${interaction.customId}`);
        }
        
        // 處理選單互動
        if (interaction.isStringSelectMenu()) {
            // 在這裡添加選單處理邏輯
            console.log(`選單被選擇: ${interaction.customId}`);
        }
        
        // 處理模態框提交
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('song_answer_')) {
                const { handleSongAnswerModal } = require('./modal-handler.js');
                await handleSongAnswerModal(interaction);
                return;
            }

            if (interaction.customId === 'maimai_login_modal') {
                await handleMaimaiLoginModal(interaction);
                return;
            }
        }
    },
};

async function handleMaimaiLoginModal(interaction) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const userSessions = require('../utils/userSessions');

    const SERVER_LABELS = { INT: '🌏 國際版 (International)', JP: '🇯🇵 日本版 (Japan)' };

    const segaId = interaction.fields.getTextInputValue('sega_id').trim();
    const password = interaction.fields.getTextInputValue('sega_password');
    const primaryServer = userSessions.getServer(interaction.user.id);

    // 立即延遲回覆（登入需要幾秒）
    await interaction.deferReply({ ephemeral: true });

    const { int: intErr, jp: jpErr } = await userSessions.loginBoth(interaction.user.id, segaId, password);

    const intOk = intErr === null;
    const jpOk  = jpErr  === null;

    if (!intOk && !jpOk) {
        // Both failed – likely wrong credentials
        console.error(`[MaimaiLogin] 用戶 ${interaction.user.id} 兩個伺服器均登入失敗:`, intErr?.message);

        const embed = new EmbedBuilder()
            .setColor(0xFF4444)
            .setTitle('❌ 登入失敗にゃ')
            .setDescription('Salt 無法登入 maimai DX にゃ，請確認帳號和密碼是否正確にゃ')
            .addFields(
                { name: '🌏 國際版', value: `❌ ${intErr.message || '未知錯誤'}`, inline: false },
                { name: '🇯🇵 日本版', value: `❌ ${jpErr.message || '未知錯誤'}`, inline: false },
            )
            .setFooter({ text: '如果問題持續，請稍後再試にゃ', iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // At least one server succeeded
    if (intErr) console.error(`[MaimaiLogin] 用戶 ${interaction.user.id} 國際版登入失敗:`, intErr.message);
    if (jpErr)  console.error(`[MaimaiLogin] 用戶 ${interaction.user.id} 日本版登入失敗:`, jpErr.message);

    const embed = new EmbedBuilder()
        .setColor(intOk && jpOk ? 0x00C851 : 0xF39C12)
        .setTitle(intOk && jpOk ? '✅ 登入成功！' : '⚠️ 部分伺服器登入成功にゃ')
        .setDescription('Salt 幫你登入 maimai DX 了にゃ～')
        .addFields(
            { name: '👤 帳號', value: segaId, inline: true },
            { name: '⭐ 主要伺服器', value: SERVER_LABELS[primaryServer], inline: true },
            { name: '🕐 登入時間', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            { name: '🌏 國際版', value: intOk ? '✅ 已登入' : `❌ ${intErr.message}`, inline: true },
            { name: '🇯🇵 日本版', value: jpOk  ? '✅ 已登入' : `❌ ${jpErr.message}`,  inline: true },
        )
        .setFooter({ text: 'Session 有效期為 1 小時にゃ，使用 /maimai-logout 可以登出', iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    const saveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`maimai_creds_save_${interaction.user.id}`)
            .setLabel('💾 儲存帳號密碼')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`maimai_creds_nosave_${interaction.user.id}`)
            .setLabel('❌ 不儲存')
            .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [saveRow] });
}
// 輔助函數
function createGameEmbed(gameId, songs, revealedLetters, wrongLetters, remainingWrongGuesses) {
    const { EmbedBuilder } = require('discord.js');
    
    const embed = new EmbedBuilder()
        .setColor(remainingWrongGuesses > 3 ? 0x00FF00 : remainingWrongGuesses > 1 ? 0xFFFF00 : 0xFF0000)
        .setTitle('� Salt 的 maimai DX 歌曲猜字遊戲にゃ')
        .setDescription('Salt 從 maimai DX 選了 5 首歌曲，猜字母來揭開歌名吧にゃ！');

    // 顯示所有歌曲的遮蔽狀態
    let songsDisplay = '';
    songs.forEach((song, index) => {
        const maskedName = createMaskedSongName(song.name, revealedLetters);
        const genreEmoji = getGenreEmoji(song.genre);
        songsDisplay += `${genreEmoji} **${index + 1}.** \`${maskedName}\` *(${song.genre || 'maimai DX'})*\n`;
    });

    embed.addFields(
        {
            name: '🎼 歌曲列表',
            value: songsDisplay,
            inline: false
        }
    );

    // 顯示已猜過的字母
    if (revealedLetters.size > 0) {
        embed.addFields({
            name: '✅ 正確字母',
            value: Array.from(revealedLetters).map(letter => `\`${letter.toUpperCase()}\``).join(' '),
            inline: true
        });
    }

    if (wrongLetters.size > 0) {
        embed.addFields({
            name: '❌ 錯誤字母',
            value: Array.from(wrongLetters).map(letter => `\`${letter.toUpperCase()}\``).join(' '),
            inline: true
        });
    }

    embed.addFields({
        name: '📊 遊戲狀態',
        value: `剩餘錯誤機會: ${remainingWrongGuesses} 次\n遊戲ID: \`${gameId}\``,
        inline: false
    });

    embed.setFooter({ 
        text: 'Salt 說：使用按鈕猜字母，或用 /submit-song 猜完整歌名にゃ'
    })
    .setTimestamp();

    return embed;
}

function createMaskedSongName(songName, revealedLetters) {
    return songName
        .toUpperCase()
        .split('')
        .map(char => {
            if (char === ' ') {
                return ' ';
            } else if (revealedLetters.has(char.toLowerCase()) || revealedLetters.has(char.toUpperCase())) {
                return char;
            } else if (/[A-Za-z]/.test(char)) {
                return '_';
            } else {
                // 數字和特殊符號直接顯示
                return char;
            }
        })
        .join('');
}

function getGameEmoji(gameName) {
    return '🎡'; // maimai DX 的統一圖示
}

function getGenreEmoji(genre) {
    const genreEmojis = {
        'GAME & VARIETY': '🎮',
        'POPS & ANIME': '📺',
        'niconico & VOCALOID': '�',
        'ORIGINAL & JOYPOLIS': '�',
        'VARIETY': '�'
    };
    return genreEmojis[genre] || '🎵';
}

function checkGameComplete(songs, revealedLetters) {
    return songs.every(song => {
        const maskedName = createMaskedSongName(song.name, revealedLetters);
        return !maskedName.includes('_');
    });
}
