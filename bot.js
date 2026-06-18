const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// 🔥 ضد الموت - تحقق من ENV
if (!process.env.BOT_TOKEN ||!process.env.SUPABASE_URL ||!process.env.SUPABASE_KEY) {
    console.error('ERROR: Missing ENV variables - Bot Dead 💀');
    process.exit(1);
}

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, {polling: true});
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 🔥 ضد ريندر - سيرفر خالد
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Dandlioni 10A Immortal ♾️👊'));
app.get('/health', (req, res) => res.status(200).json({status: 'alive', timestamp: Date.now()}));
app.listen(PORT, () => console.log(`🔥 Immortal Server شغال على بورت ${PORT}`));

// 🔥 ضد 409 Conflict - اقتل النسخ القديمة
bot.deleteWebHook().then(() => console.log('Webhook murdered 💀'));

const GAMES = require('./games.json');
const ADMIN_ID = 8300457254; // ⚠️ حط ID تاعك من @userinfobot
const activeGames = {};
const adminStates = {};
const getD = () => ({w: 'أهلا بيك يا وحش', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب'});

// 🔥 ضد الزومبي - إحياء اللاعبين الميتين
async function getUser(id) {
    let {data} = await db.from('players').select().eq('id', id).single();

    if (!data) {
        const {data: n} = await db.from('players').insert({
            id,
            points: 500,
            energy: 1000,
            max_energy: 1000,
            level: 1,
            total_points_earned: 500,
            last_energy_update: new Date().toISOString()
        }).select().single();
        return n;
    }

    // تصليح الجثث - null = 1000
    data.energy = data.energy?? data.max_energy?? 1000;
    data.max_energy = data.max_energy?? 1000;
    data.last_energy_update = data.last_energy_update?? new Date().toISOString();

    // تجديد الطاقة بالوقت
    const hours = Math.floor((Date.now() - new Date(data.last_energy_update)) / 3600000);
    if (hours > 0) {
        const newE = Math.min(data.max_energy, data.energy + hours * 50);
        await db.from('players').update({
            energy: newE,
            max_energy: data.max_energy,
            last_energy_update: new Date().toISOString()
        }).eq('id', id);
        data.energy = newE;
    }
    return data;
}

function menu(id, txt = null) {
    const d = getD();
    const t = txt || `${d.w} في إمبراطورية Dandlioni 10A ♾️👊`;
    let kb = [
        [{text: `🎮 50 ${d.g} تفاعلية`, callback_data: 'games'}, {text: `📜 25 ${d.m}`, callback_data: 'tasks'}],
        [{text: '💎 بروفايلي', callback_data: 'me'}, {text: '🏆 التوب', callback_data: 'top'}],
        [{text: '🚀 موّل قناتك مجانا', callback_data: 'add_channel'}]
    ];
    if (id == ADMIN_ID) kb.push([{text: '👑 لوحة الأدمن Immortal', callback_data: 'admin_panel'}]);
    bot.sendMessage(id, t, {reply_markup: {inline_keyboard: kb}});
}

async function adminPanel(chatId, msgId = null) {
    const {count: userCount} = await db.from('players').select('*', {count: 'exact', head: true});
    const {count: sponsorCount} = await db.from('sponsors').select('*', {count: 'exact', head: true});
    const {data: topPlayer} = await db.from('players').select('points').order('points', {ascending: false}).limit(1).single();

    const txt = `👑 **لوحة تحكم الإمبراطور الخالد** ♾️\n\n📊 **إحصائيات:**\n👥 اللاعبين: ${userCount || 0}\n📢 القنوات: ${sponsorCount || 0}\n💎 أعلى رصيد: ${topPlayer?.points || 0}\n\n⚡ **التحكم:**`;
    const kb = {inline_keyboard: [
        [{text: '📢 إدارة القنوات', callback_data: 'admin_channels'}, {text: '👥 إدارة اللاعبين', callback_data: 'admin_users'}],
        [{text: '💰 إضافة نقاط', callback_data: 'admin_addpoints'}, {text: '📢 إذاعة للكل', callback_data: 'admin_broadcast'}],
        [{text: '🧟 إحياء كل الزومبي', callback_data: 'admin_revive'}],
        [{text: '🔙 رجوع للقائمة', callback_data: 'back'}]
    ]};
    if (msgId) bot.editMessageText(txt, {chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: kb});
    else bot.sendMessage(chatId, txt, {parse_mode: 'Markdown', reply_markup: kb});
}

async function finishGame(userId, game, reward, customMsg = '') {
    if (reward > 0) {
        await db.from('players').update({
            points: db.raw(`points + ${reward}`),
            total_points_earned: db.raw(`total_points_earned + ${reward}`)
        }).eq('id', userId);
    }
    const u = await getUser(userId);
    const gameState = activeGames[userId];
    delete activeGames[userId];
    const msg = customMsg || `🎉 ربحت ${reward} ${getD().p}!`;
    bot.editMessageText(`${msg}\n\n💎 رصيدك: ${u.points} ${getD().p}\n⚡ طاقتك: ${u.energy}/${u.max_energy}\n\n🔥 ♾️`, {
        chat_id: gameState.chatId, message_id: gameState.msgId,
        reply_markup: {inline_keyboard: [
            [{text: '🔄 العب مرة اخرى', callback_data: `start_${game.id}`}],
            [{text: '🎮 ألعاب اخرى', callback_data: `cat_${game.category}`}],
            [{text: '🏠 القائمة', callback_data: 'back'}]
        ]}
    }).catch(()=>{});
}

bot.onText(/\/start/, async (msg) => {
    const u = await getUser(msg.from.id);
    const d = getD();
    menu(msg.chat.id, `${d.w} ${msg.from.first_name} ♾️\n\n🎁 هدية: 500 ${d.p} + 1000 ${d.e}\n🎮 50 لعبة تفاعلية | 📜 25 مهمة\n🚀 أول 50 قناة تمويل مجاني`);
});

bot.onText(/\/admin/, async (msg) => {
    if (msg.from.id!= ADMIN_ID) return bot.sendMessage(msg.chat.id, '❌ معندكش صلاحية 💀');
    adminPanel(msg.chat.id);
});

bot.on('callback_query', async (q) => {
    const id = q.from.id;
    const data = q.data;
    const u = await getUser(id);
    const d = getD();
    await bot.answerCallbackQuery(q.id).catch(()=>{});

    if (data === 'admin_panel') {
        if (id!= ADMIN_ID) return;
        return adminPanel(q.message.chat.id, q.message.message_id);
    }

    if (data === 'admin_revive') {
        if (id!= ADMIN_ID) return;
        await db.from('players').update({
            energy: 1000,
            max_energy: 1000,
            last_energy_update: new Date().toISOString()
        }).or('energy.is.null,energy.lt.100');
        bot.editMessageText(`🧟✅ تم إحياء كل الزومبي! الطاقة 1000/1000 للكل ♾️`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'admin_panel'}]]}});
    }

    if (data === 'admin_channels') {
        if (id!= ADMIN_ID) return;
        const {data: channels} = await db.from('sponsors').select().order('id', {ascending: true}).limit(20);
        let txt = `📢 **إدارة القنوات** ♾️\n\n`;
        if (!channels || channels.length === 0) txt += `❌ مكاش قنوات\n\n`;
        else {
            channels.forEach((c, i) => {
                txt += `${i+1}. ${c.username}\nهدف: ${c.target_joins} | جاب: ${c.current_joins}\nID: \`${c.id}\`\n\n`;
            });
        }
        txt += `⚡ **أوامر:**\n\`/delchannel ID\` - حذف\n\`/addchannel @user هدف\` - إضافة`;
        bot.editMessageText(txt, {chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'Markdown',
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'admin_panel'}]]}});
    }

    if (data === 'admin_users') {
        if (id!= ADMIN_ID) return;
        const {count} = await db.from('players').select('*', {count: 'exact', head: true});
        const {data: top5} = await db.from('players').select('id,points').order('points', {ascending: false}).limit(5);
        let txt = `👥 **إدارة اللاعبين** ♾️\n\n📊 العدد: ${count}\n\n🏆 **توب 5:**\n`;
        top5.forEach((u, i) => { txt += `${i+1}. \`${u.id}\` - ${u.points} ${d.p}\n`; });
        txt += `\n⚡ **أوامر:**\n\`/userinfo ID\`\n\`/addpoints ID مبلغ\``;
        bot.editMessageText(txt, {chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'Markdown',
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'admin_panel'}]]}});
    }

    if (data === 'admin_addpoints') {
        if (id!= ADMIN_ID) return;
        adminStates[id] = {action: 'addpoints'};
        bot.editMessageText(`💰 **إضافة نقاط** ♾️\n\nابعت: \`ID مبلغ\`\nمثال: \`123456789 50000\``, {
            chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'Markdown',
            reply_markup: {inline_keyboard: [[{text: '❌ إلغاء', callback_data: 'admin_panel'}]]}});
    }

    if (data === 'admin_broadcast') {
        if (id!= ADMIN_ID) return;
        adminStates[id] = {action: 'broadcast'};
        bot.editMessageText(`📢 **إذاعة جماعية** ♾️\n\nابعت الرسالة اللي حاب تبعثها للكل:`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [[{text: '❌ إلغاء', callback_data: 'admin_panel'}]]}});
    }

    if (data === 'games') {
        const cats = ['ضغط','حظ','ذكاء','قتال','اقتصاد'];
        let kb = cats.map(c => [{text: `🎮 ${c}`, callback_data: `cat_${c}`}]);
        kb.push([{text: '🔙 رجوع', callback_data: 'back'}]);
        return bot.editMessageText(`اختر فئة | ${d.e}: ${u.energy}/${u.max_energy} ♾️`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: kb}
        });
    }

    if (data.startsWith('cat_')) {
        const cat = data.split('_')[1];
        const games = GAMES.filter(g => g.category === cat);
        let kb = games.map(g => [{text: `${g.name} - ${g.cost} ${d.e}`, callback_data: `start_${g.id}`}]);
        kb.push([{text: '🔙 رجوع', callback_data: 'games'}]);
        return bot.editMessageText(`ألعاب ${cat} | ${d.e}: ${u.energy} ♾️`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: kb}
        });
    }

    if (data.startsWith('start_')) {
        const gameId = parseInt(data.split('_')[1]);
        const game = GAMES.find(g => g.id === gameId);
        if (!game) return;
        if (u.energy < game.cost) return bot.answerCallbackQuery(q.id, {text: `❌ طاقتك ناقصة! تحتاج ${game.cost}`, show_alert: true});
        await db.from('players').update({energy: u.energy - game.cost}).eq('id', id);
        const gameState = {gameId, msgId: q.message.message_id, chatId: q.message.chat.id, type: game.type};
        activeGames[id] = gameState;

        if (game.type === 'clicker') {
            gameState.clicks = 0;
            gameState.startTime = Date.now();
            bot.editMessageText(`🔥 ${game.name} ♾️\n\nاضغط أكبر عدد في 5 ثواني!\nالضغطات: 0`, {
                chat_id: q.message.chat.id, message_id: q.message.message_id,
                reply_markup: {inline_keyboard: [[{text: '👊 اضغط!!!', callback_data: `click_${gameId}`}]]}
            });
            setTimeout(() => {
                if (activeGames[id]) finishGame(id, game, gameState.clicks * game.reward);
            }, 5000);
        }
        else if (game.type === 'rps') {
            bot.editMessageText(`✂️ ${game.name} ♾️\n\nاختار سلاحك:`, {
                chat_id: q.message.chat.id, message_id: q.message.message_id,
                reply_markup: {inline_keyboard: [
                    [{text: '🗿 حجر', callback_data: `rps_${gameId}_rock`}, {text: '📄 ورقة', callback_data: `rps_${gameId}_paper`}],
                    [{text: '✂️ مقص', callback_data: `rps_${gameId}_scissors`}]
                ]}
            });
        }
        else if (game.type === 'quiz') {
            let kb = game.opts.map(opt => [{text: opt, callback_data: `quiz_${gameId}_${opt}`}]);
            bot.editMessageText(`🧠 ${game.name} ♾️\n\n${game.q}`, {
                chat_id: q.message.chat.id, message_id: q.message.message_id,
                reply_markup: {inline_keyboard: kb}
            });
        }
        else if (game.type === 'choice') {
            bot.editMessageText(`🎁 ${game.name} ♾️\n\nاختار صندوق:`, {
                chat_id: q.message.chat.id, message_id: q.message.message_id,
                reply_markup: {inline_keyboard: [
                    [{text: '🎁 1', callback_data: `choice_${gameId}_1`}, {text: '🎁 2', callback_data: `choice_${gameId}_2`}],
                    [{text: '🎁 3', callback_data: `choice_${gameId}_3`}]
                ]}
            });
        }
    }

    if (data.startsWith('click_')) {
        if (!activeGames[id] || Date.now() - activeGames[id].startTime > 5000) return;
        activeGames[id].clicks++;
        bot.editMessageText(`🔥 ضغط مستمر ♾️\n\nالضغطات: ${activeGames[id].clicks} 👊\nالوقت: ${5 - Math.floor((Date.now() - activeGames[id].startTime) / 1000)}ث`, {
            chat_id: activeGames[id].chatId, message_id: activeGames[id].msgId,
            reply_markup: {inline_keyboard: [[{text: `👊 اضغط! ${activeGames[id].clicks}`, callback_data: data}]]}
        }).catch(()=>{});
    }

    if (data.startsWith('rps_')) {
        const [_, gameId, userChoice] = data.split('_');
        const game = GAMES.find(g => g.id == gameId);
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        const emojis = {rock: '🗿', paper: '📄', scissors: '✂️'};
        let reward = 0, result = '';
        if (userChoice === botChoice) { result = '🤝 تعادل'; reward = Math.floor(game.reward / 4); }
        else if ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) {
            result = '🎉 ربحت'; reward = game.reward;
        } else { result = '💀 خسرت'; reward = 0; }
        finishGame(id, game, reward, `${result}\nانت: ${emojis[userChoice]} vs البوت: ${emojis[botChoice]}`);
    }

    if (data.startsWith('quiz_')) {
        const [_, gameId, answer] = data.split('_');
        const game = GAMES.find(g => g.id == gameId);
        const reward = answer === game.a? game.reward : 0;
        const result = answer === game.a? '✅ صحيح' : `❌ خطأ! الجواب: ${game.a}`;
        finishGame(id, game, reward, result);
    }

    if (data.startsWith('choice_')) {
        const [_, gameId, choice] = data.split('_');
        const game = GAMES.find(g => g.id == gameId);
        const winBox = Math.floor(Math.random() * 3) + 1;
        const reward = choice == winBox? game.reward : 0;
        const result = choice == winBox? `🎉 اخترت الصحيح!` : `💀 الفائز كان رقم ${winBox}`;
        finishGame(id, game, reward, result);
    }

    if (data === 'me') {
        return bot.editMessageText(`💎 بروفايلك ♾️\n\n👤 ${q.from.first_name}\n💰 ${d.p}: ${u.points}\n⚡ ${d.e}: ${u.energy}/${u.max_energy}\n📊 ليفل: ${u.level}`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'back'}]]}
        });
    }

    if (data === 'top') {
        const {data: top} = await db.from('players').select('id,points').order('points', {ascending: false}).limit(10);
        let txt = `🏆 **توب 10 إمبراطورية Dandlioni** ♾️\n\n`;
        top.forEach((p, i) => { txt += `${i+1}. \`${p.id}\` - ${p.points} ${d.p}\n`; });
        bot.editMessageText(txt, {chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'Markdown',
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'back'}]]}});
    }

    if (data === 'back') menu(q.message.chat.id);
});

bot.on('message', async (msg) => {
    if (msg.from.id!= ADMIN_ID ||!adminStates[msg.from.id] || msg.text.startsWith('/')) return;
    const state = adminStates[msg.from.id];
    const d = getD();

    if (state.action === 'addpoints') {
        const [userId, amount] = msg.text.split(' ');
        if (!userId ||!amount || isNaN(amount)) return bot.sendMessage(msg.chat.id, '❌ صيغة غالطة. استعمل: `ID مبلغ`');
        await db.from('players').update({points: db.raw(`points + ${amount}`)}).eq('id', userId);
        bot.sendMessage(msg.chat.id, `✅ زدت ${amount} ${d.p} للاعب \`${userId}\` ♾️`, {parse_mode: 'Markdown'});
        delete adminStates[msg.from.id];
    }

    if (state.action === 'broadcast') {
        const {data: users} = await db.from('players').select('id').limit(1000);
        let sent = 0;
        for (const u of users) {
            try { await bot.sendMessage(u.id, `📢 **إعلان إمبراطوري** ♾️\n\n${msg.text}`, {parse_mode: 'Markdown'}); sent++; } catch(e){}
        }
        bot.sendMessage(msg.chat.id, `✅ تم الإرسال لـ ${sent}/${users.length} لاعب ♾️`);
        delete adminStates[msg.from.id];
    }
});

bot.onText(/\/delchannel (\d+)/, async (msg, match) => {
    if (msg.from.id!= ADMIN_ID) return;
    await db.from('sponsors').delete().eq('id', match[1]);
    bot.sendMessage(msg.chat.id, `✅ تم حذف القناة رقم ${match[1]} ♾️`);
});

bot.onText(/\/addchannel (@\w+) (\d+)/, async (msg, match) => {
    if (msg.from.id!= ADMIN_ID) return;
    await db.from('sponsors').insert({username: match[1], tier: 'vip', priority: 1, target_joins: parseInt(match[2]), current_joins: 0});
    bot.sendMessage(msg.chat.id, `✅ تم إضافة ${match[1]} بهدف ${match[2]} عضو ♾️`);
});

bot.onText(/\/userinfo (\d+)/, async (msg, match) => {
    if (msg.from.id!= ADMIN_ID) return;
    const {data: user} = await db.from('players').select().eq('id', match[1]).single();
    if (!user) return bot.sendMessage(msg.chat.id, '❌ لاعب غير موجود');
    const d = getD();
    bot.sendMessage(msg.chat.id, `👤 **معلومات اللاعب** ♾️\n\n🆔 ID: \`${user.id}\`\n💰 ${d.p}: ${user.points}\n⚡ ${d.e}: ${user.energy}/${user.max_energy}\n📊 ليفل: ${user.level}`, {parse_mode: 'Markdown'});
});

bot.onText(/\/addpoints (\d+) (\d+)/, async (msg, match) => {
    if (msg.from.id!= ADMIN_ID) return;
    const userId = match[1], amount = parseInt(match[2]);
    await db.from('players').update({points: db.raw(`points + ${amount}`)}).eq('id', userId);
    bot.sendMessage(msg.chat.id, `✅ زدت ${amount} نقطة للاعب ${userId} ♾️`);
});

bot.onText(/\/revive/, async (msg) => {
    if (msg.from.id!= ADMIN_ID) return;
    await db.from('players').update({
        energy: 1000,
        max_energy: 1000,
        last_energy_update: new Date().toISOString()
    }).or('energy.is.null,energy.lt.100');
    bot.sendMessage(msg.chat.id, '🧟✅ تم إحياء كل الزومبي! الطاقة 1000/1000 للكل ♾️');
});

// 🔥 ضد الأخطاء - ما يموتش
process.on('uncaughtException', (err) => console.error('Caught exception:', err));
process.on('unhandledRejection', (err) => console.error('Caught rejection:', err));

console.log('Dandlioni 10A Immortal شغال ضد الموت ضد الزومبي ♾️👊');
