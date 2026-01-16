# 🐾 Salt Bot - maimai DX Discord Bot

> 一個以 maimai DX 中 Salt 角色為主題的可愛 Discord 機器人にゃ～

## ✨ 特色功能

### 🎵 maimai DX 相關
- **歌曲搜尋** - 搜尋 maimai DX 歌曲資料庫
- **隨機推薦** - 根據難度、等級、類型隨機推薦歌曲
- **Rating 計算** - 計算 maimai DX Rating 分數
- **遊戲資訊** - 查看 maimai DX 統計資料

### 🎮 遊戲功能
- **猜數字遊戲** - 和 Salt 一起玩猜數字
- **石頭剪刀布** - 和 Salt 來場對決
- **擲骰子** - 多種骰子遊戲模式
- **翻硬幣** - 決定命運的硬幣
- **8號球** - 神奇8號球占卜

### 🛠️ 實用工具
- **用戶資訊** - 查看用戶和伺服器資訊
- **頭像查看** - 查看用戶頭像
- **機器人狀態** - 管理員可自訂機器人狀態

### � 管理功能
- **踢出** - 請不乖的成員離開
- **封鎖/解封** - 管理惡意用戶
- **禁言/解禁** - 讓人冷靜一下
- **清理訊息** - 批量清理頻道訊息

## 🐱 Salt 角色特色

Salt Bot 完全體現了 maimai DX 中 Salt 角色的可愛個性：
- 所有回應都帶有「にゃ」語尾詞
- 溫柔友善的互動方式
- 陪伴感十足的遊戲體驗
- 即使是管理功能也保持可愛風格
- 🏰 **伺服器資訊** - 顯示伺服器統計數據
- 🖼️ **頭像命令** - 顯示用戶頭像
- 🆘 **幫助系統** - 列出所有可用命令

### 🛡️ 管理功能
- 🦶 **踢除成員** - 踢除違規用戶
- 🔨 **封鎖成員** - 永久封鎖用戶
- ✅ **解除封鎖** - 解除用戶封鎖
- 🔇 **暫停發言** - 臨時限制用戶發言
- 🔊 **解除暫停** - 恢復用戶發言權限
- 🗑️ **清除訊息** - 批量刪除頻道訊息

### 🎮 遊戲娛樂
- 🎯 **猜數字** - 智力挑戰遊戲
- 🪨 **石頭剪刀布** - 經典對戰遊戲
- 🎲 **擲骰子** - 運氣測試遊戲
- 🎱 **神奇8號球** - 預測問答遊戲
- 🪙 **翻硬幣** - 隨機決策工具

### 🎵 maimai DX
- 🎶 **隨機選歌** - 智能歌曲推薦系統
- 🔍 **歌曲搜尋** - 快速查找歌曲資訊
- 📊 **Rating 計算** - 精確成績評估
- 🌅 **每日推薦** - 個性化練習建議
- 📈 **遊戲統計** - 完整資料分析

## 安裝步驟

### 1. 複製專案
```bash
git clone https://github.com/xydesu/SaltBot.git
cd SaltBot
```

### 2. 安裝依賴
```bash
npm install
```

### 3. 設定環境變數
1. 複製 `.env.example` 並重新命名為 `.env`
2. 填入您的機器人資訊：

```env
DISCORD_TOKEN=你的機器人Token
CLIENT_ID=你的機器人客戶端ID
GUILD_ID=你的測試伺服器ID（可選）
```

### 4. 獲取 Discord Bot Token

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 點擊 "New Application" 創建新應用程式
3. 在左側選單中選擇 "Bot"
4. 點擊 "Add Bot"
5. 在 "Token" 區域點擊 "Copy" 複製您的機器人 token
6. 將 token 貼到 `.env` 文件中的 `DISCORD_TOKEN`

### 5. 獲取 Client ID
1. 在 Discord Developer Portal 中，選擇 "General Information"
2. 複製 "Application ID"
3. 將此 ID 貼到 `.env` 文件中的 `CLIENT_ID`

### 6. 邀請機器人到您的伺服器
1. 在 Discord Developer Portal 中，選擇 "OAuth2" > "URL Generator"
2. 在 "Scopes" 中選擇 `bot` 和 `applications.commands`
3. 在 "Bot Permissions" 中選擇需要的權限：
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - View Channels
   - Kick Members (踢除成員功能)
   - Ban Members (封鎖/解封功能)
   - Moderate Members (暫停發言功能)
   - Manage Messages (清除訊息功能)
4. 複製生成的 URL 並在瀏覽器中打開以邀請機器人

### 7. 部署命令
```bash
node deploy-commands.js
```

### 8. 啟動機器人
```bash
npm start
```

## 開發模式

使用 Node.js 的 watch 模式進行開發：
```bash
npm run dev
```

## 項目結構

```
SaltBot/
├── commands/              # 斜線命令 (按功能分類)
│   ├── general/          # 一般命令
│   │   ├── ping.js       # 延遲檢測
│   │   ├── help.js       # 幫助系統
│   │   └── info.js       # 機器人資訊
│   ├── utility/          # 實用工具
│   │   ├── user.js       # 用戶資訊
│   │   ├── server.js     # 伺服器資訊
│   │   └── avatar.js     # 用戶頭像
│   ├── moderation/       # 管理命令
│   │   ├── kick.js       # 踢除成員
│   │   ├── ban.js        # 封鎖成員
│   │   ├── unban.js      # 解除封鎖
│   │   ├── timeout.js    # 暫停發言
│   │   ├── untimeout.js  # 解除暫停
│   │   └── clear.js      # 清除訊息
│   ├── games/            # 遊戲娛樂
│   │   ├── guess.js      # 猜數字遊戲
│   │   ├── guessnum.js   # 數字猜測提交
│   │   ├── rps.js        # 石頭剪刀布
│   │   ├── dice.js       # 擲骰子
│   │   ├── 8ball.js      # 神奇8號球
│   │   └── coinflip.js   # 翻硬幣
│   └── maimai/           # maimai DX 音樂遊戲
│       ├── maimai-random.js  # 隨機選歌
│       ├── maimai-search.js  # 歌曲搜尋
│       ├── maimai-rating.js  # Rating計算
│       ├── maimai-daily.js   # 每日推薦
│       └── maimai-info.js    # 遊戲資訊
├── events/             # 事件處理器
│   ├── ready.js
│   └── interactionCreate.js
├── index.js           # 主要機器人文件
├── deploy-commands.js # 命令部署腳本
├── package.json
├── .env.example       # 環境變數範例
└── README.md
```

### 命令分類說明

- **📊 General (一般)** - 基本機器人功能和資訊命令
- **🔧 Utility (實用工具)** - 用戶和伺服器資訊查詢工具
- **🛡️ Moderation (管理)** - 伺服器管理和審核功能
- **🎮 Games (遊戲)** - 互動娛樂和小遊戲功能
- **🎵 maimai (音遊)** - maimai DX 相關功能和工具

## 可用命令

### 📊 一般命令
- `/ping` - 檢查機器人的延遲
- `/help` - 顯示所有可用命令
- `/info` - 顯示機器人詳細資訊
- `/user [用戶]` - 顯示用戶資訊
- `/server` - 顯示伺服器資訊
- `/avatar [用戶]` - 顯示用戶頭像

### 🛡️ 管理命令
- `/kick <用戶> [原因]` - 踢除伺服器成員
- `/ban <用戶> [原因] [刪除天數]` - 封鎖伺服器成員
- `/unban <用戶ID> [原因]` - 解除封鎖用戶
- `/timeout <用戶> <分鐘> [原因]` - 暫停用戶發言
- `/untimeout <用戶> [原因]` - 解除用戶暫停
- `/clear <數量> [用戶]` - 清除頻道訊息 (1-100則)

### 🎮 遊戲命令
- `/guess [範圍]` - 開始猜數字遊戲
- `/guessnum <遊戲ID> <數字>` - 提交猜測
- `/rps [選擇]` - 石頭剪刀布對戰
- `/dice [面數] [數量]` - 擲骰子 (1-10個，2-100面)
- `/8ball <問題>` - 向神奇8號球提問
- `/coinflip [猜測] [次數]` - 翻硬幣 (1-10次)

### 🎵 maimai DX 命令
- `/maimai-random [難度] [等級] [類型]` - 隨機選歌推薦
- `/maimai-search <關鍵字> [搜尋類型]` - 搜尋歌曲資訊
- `/maimai-rating <定數> <達成率> [DX]` - 計算Rating分數
- `/maimai-daily [類型]` - 獲取每日推薦歌曲
- `/maimai-info` - 查看遊戲統計資訊

## 添加新命令

1. 選擇適當的分類資料夾：
   - `commands/general/` - 一般基本功能
   - `commands/utility/` - 實用工具功能
   - `commands/moderation/` - 管理審核功能

2. 在對應資料夾中創建新的 `.js` 文件

3. 使用以下模板：

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('命令名稱')
        .setDescription('命令描述'),
    async execute(interaction) {
        await interaction.reply('Hello World!');
    },
};
```

4. 運行 `node deploy-commands.js` 部署新命令
5. 重新啟動機器人

### 自動載入系統
機器人會自動掃描所有子資料夾並載入其中的命令文件，無需手動註冊。

## 管理功能詳細說明

### 權限檢查
所有管理命令都會檢查：
- 執行者是否有相應權限
- 機器人是否有執行權限
- 目標用戶的角色階層
- 防止自我操作

### 安全機制
- 🛡️ 角色階層保護：無法對相同或更高權限的用戶執行操作
- 📝 操作日誌：所有管理操作都會記錄執行者和原因
- 💬 私訊通知：被操作的用戶會收到私訊通知（如果可能）
- ⏰ 時間限制：只能刪除14天內的訊息

### 使用範例
```
/kick @用戶 垃圾訊息
/ban @用戶 嚴重違規 7
/timeout @用戶 30 刷屏行為
/clear 50 @用戶
```

## 系統需求

- Node.js 16.11.0 或更高版本
- Discord.js v14

## 許可證

MIT License

## 支援

如果您遇到任何問題，請創建一個 Issue 或聯繫開發者。

## 銘謝
[Otoge-DB](https://github.com/zvuc/otoge-db) 曲目數據和封面
