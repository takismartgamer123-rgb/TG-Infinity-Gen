const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const GAMES = require('./games.json');

const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const bot = new TelegramBot(token, {polling: true});
const db = createClient(supabaseUrl, supabaseKey);

// ===== اللهجات =====
const DIALECTS = {
    dz: {w: 'أهلا بيك يا وحش', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب', s: 'متجر'},
    eg: {w: 'أهلا بيك يا نجم', e: 'طاقة', p: 'نقط', m: 'مهمات', g: 'ألعاب', s: 'متجر'},
    sa: {w: 'حياك الله', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب', s: 'متجر'},
    ma: {w: 'مرحبا بيك أصاط', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب', s: 'متجر'},
    iq: {w: 'هلا بيك حبيبي', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب', s: 'متجر'},
    default: {w: 'أهلا بيك', e: 'طاقة', p: 'نقاط', m: 'مهام', g: 'ألعاب', s: 'متجر'}
};
const getD = (u) => {
    const l = u?.language_code || 'ar';
    if (l.includes('DZ')) return DIALECTS.dz;
    if (l.includes('EG')) return DIALECTS.eg;
    if (l.includes('SA')) return DIALECTS.sa;
    if (l.includes('MA')) return DIALECTS.ma;
    if (l.includes('IQ')) return DIALECTS.iq;
    return DIALECTS.default;
};

// ===== دوال مساعدة =====
async function getUser(id, lang = 'ar') {
    let {data} = await db.from('players').select().eq('id', id).single();
    if (!data) {
        const {data: n} = await db.from('players').insert({
            id, points: 500, energy: 1000, max_energy: 1000, level: 1, total_points_earned: 500, lang
        }).select().single();
        return n;
    }
    const hours = Math.floor((Date.now() - new Date(data.last_energy_update)) / 3600000);
    if (hours > 0) {
        const newE = Math.min(data.max_energy, data.energy + hours * 50);
        await db.from('players').update({energy: newE, last_energy_update: new Date().toISOString()}).eq('id', id);
        data.energy = newE;
    }
    return data;
}

async function checkSub(uid, ch) {
    try {
        const r = await bot.getChatMember(ch, uid);
        return ['member', 'administrator', 'creator'].includes(r.status);
    } catch { return false; }
}

async function canPlay(uid, gid) {
    const g = GAMES.find(x => x.id === gid);
    const u = await getUser(uid);
    if (u.energy < g.energy) return {ok: false, msg: `طاقة ناقصة 💀 تحتاج ${g.energy}`};
    const {data: l} = await db.from('game_cooldowns').select().eq('user_id', uid).eq('game_id', gid).single();
    if (l) {
        const diff = (Date.now() - new Date(l.last_played)) / 1000;
        if (diff < g.cooldown) return {ok: false, msg: `استنى ${Math.ceil(g.cooldown - diff)}ث ⏳`};
    }
    return {ok: true, g, u};
}

// ===== القائمة =====
function menu(id, txt = null, u = null) {
    const d = getD(u);
    const t = txt || `${d.w} في إمبراطورية Dandlioni 10A ♾️👊`;
    bot.sendMessage(id, t, {
        reply_markup: {
            inline_keyboard: [
                [{text: `🎮 50 ${d.g}`, callback_data: 'games'}, {text: `📜 25 ${d.m}`, callback_data: 'tasks'}],
                [{text: '💎 بروفايلي', callback_data: 'me'}, {text: '🏆 التوب 10', callback_data: 'top'}],
                [{text: '🚀 موّل قناتك مجانا', callback_data: 'add_channel'}],
                [{text: `⚡ شحن ${d.e}`, callback_data: 'energy'}, {text: `🛒 ${d.s}`, callback_data: 'shop'}]
            ]
        }
    });
}

// ===== Start =====
bot.onText(/\/start/, async (msg) => {
    const u = await getUser(msg.from.id, msg.from.language_code);
    const d = getD(msg.from);
    menu(msg.chat.id, `${d.w} ${msg.from.first_name} ♾️\n\n🎁 هدية: 500 ${d.p} + 1000 ${d.e}\n🎮 50 لعبة | 📜 25 مهمة = 17,500 ${d.p}\n🚀 أول 50 قناة تمويل مجاني`, u);
});

// ===== Callbacks =====
bot.on('callback_query', async (q) => {
    const id = q.from.id;
    const data = q.data;
    const u = await getUser(id, q.from.language_code);
    const d = getD(q.from);

    if (data === 'games') {
        const cats = ['ضغط','حظ','ذكاء','قتال','اقتصاد'];
        let kb = cats.map(c => [{text: `🎮 ${c}`, callback_data: `cat_${c}`}]);
        kb.push([{text: '🔙 رجوع', callback_data: 'back'}]);
        bot.editMessageText(`اختر فئة | ${d.e}: ${u.energy}/1000 ♾️`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: kb}
        });
    }

    if (data.startsWith('cat_')) {
        const cat = data.split('_')[1];
        const games = GAMES.filter(g => g.category === cat);
        let kb = games.map(g => [{text: `${g.name} ⚡${g.energy}`, callback_data: `play_${g.id}`}]);
        kb.push([{text: '🔙 رجوع', callback_data: 'games'}]);
        bot.editMessageText(`ألعاب ${cat}:`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: kb}
        });
    }

    if (data.startsWith('play_')) {
        const gid = parseInt(data.split('_')[1]);
        const chk = await canPlay(id, gid);
        if (!chk.ok) return bot.answerCallbackQuery(q.id, {text: chk.msg, show_alert: true});
        const g = chk.g;
        let won = 0;
        if (g.reward.includes('-')) {
            const [min, max] = g.reward.split('-').map(Number);
            won = Math.floor(Math.random() * (max - min + 1)) + min;
        } else if (g.reward.includes('x')) {
            won = Math.floor(Math.random() * 100 * parseInt(g.reward.replace('x','')) || 2);
        } else {
            won = parseInt(g.reward) || 10;
        }
        await db.from('players').update({
            points: u.points + won,
            energy: u.energy - g.energy,
            total_points_earned: u.total_points_earned + won
        }).eq('id', id);
        await db.from('game_cooldowns').upsert({
            user_id: id, game_id: gid, last_played: new Date().toISOString()
        });
        bot.answerCallbackQuery(q.id, {text: `+${won} ${d.p} ♾️`});
        menu(q.message.chat.id, `+${won} ${d.p} | ${d.e}: ${u.energy - g.energy}/1000`, u);
    }

    if (data === 'tasks') {
        const {data: sps} = await db.from('sponsors').select().eq('active', true).order('priority', {ascending: true}).limit(25);
        let txt = `📜 ${d.m} ♾️ | كل قناة = 700 ${d.p}\nتكملهم = 17,500 ${d.p}\n\n`;
        let kb = [];
        let total = 0;
        for (const s of sps) {
            const sub = await checkSub(id, s.username);
            const {data: cl} = await db.from('claimed_tasks').select().eq('user_id', id).eq('task', s.username).single();
            const rw = s.tier === 'vip'? 1400 : 700;
            const ic = s.tier === 'vip'? '🔥' : '📢';
            if (!cl) total += rw;
            txt += `${sub? '✅' : '❌'} ${ic} ${s.username}: +${rw} ${d.p}\n`;
            if (!sub) kb.push([{text: `${ic} ${s.username}`, url: `https://t.me/${s.username.replace('@','')}`}]);
        }
        txt += `\n💰 ${d.p} متاحة: ${total}`;
        kb.push([{text: '🎁 استلام', callback_data: 'claim_all_tasks'}]);
        kb.push([{text: '🔙 رجوع', callback_data: 'back'}]);
        bot.editMessageText(txt, {chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: {inline_keyboard: kb}});
    }

    if (data === 'claim_all_tasks') {
        const {data: sps} = await db.from('sponsors').select().eq('active', true).limit(25);
        let total = 0, cnt = 0;
        for (const s of sps) {
            const sub = await checkSub(id, s.username);
            const {data: cl} = await db.from('claimed_tasks').select().eq('user_id', id).eq('task', s.username).single();
            const rw = s.tier === 'vip'? 1400 : 700;
            if (sub &&!cl) {
                await db.from('claimed_tasks').insert({user_id: id, task: s.username});
                total += rw;
                cnt++;
                await db.from('sponsors').update({current_joins: s.current_joins + 1}).eq('id', s.id);
            }
        }
        if (total > 0) {
            await db.from('players').update({
                points: u.points + total,
                total_points_earned: u.total_points_earned + total
            }).eq('id', id);
            bot.answerCallbackQuery(q.id, {text: `استلمت ${total} ${d.p} من ${cnt} قنوات ♾️`});
            menu(q.message.chat.id, `مبروك! +${total} ${d.p} 👊`, u);
        } else {
            bot.answerCallbackQuery(q.id, {text: 'اشترك أولا 💀', show_alert: true});
        }
    }

    if (data === 'add_channel') {
        const {count} = await db.from('sponsors').select('*', {count: 'exact'}).eq('is_free', true);
        if (count >= 50) {
            bot.answerCallbackQuery(q.id, {text: 'انتهى العرض المجاني 💀', show_alert: true});
        } else {
            bot.sendMessage(id, `🚀 العرض المجاني: باقي ${50-count} قناة\nأرسل @يوزر قناتك و نجيبولك 1000 عضو باطل ♾️`);
        }
    }

    if (data === 'me') {
        const {data: rank} = await db.from('players').select('id').order('points', {ascending: false});
        const myRank = rank.findIndex(r => r.id === id) + 1;
        bot.editMessageText(`💎 بروفايلك ♾️\n\n👤 ${q.from.first_name}\n🏆 الترتيب: #${myRank}\n💰 ${d.p}: ${u.points}\n⚡ ${d.e}: ${u.energy}/1000\n📊 المستوى: ${u.level}\n🎮 مجموع ${d.p}: ${u.total_points_earned}`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'back'}]]}
        });
    }

    if (data === 'top') {
        const {data: tops} = await db.from('players').select('id,points').order('points', {ascending: false}).limit(10);
        let txt = `🏆 توب 10 أباطرة ♾️\n\n`;
        for (let i = 0; i < tops.length; i++) {
            try {
                const chat = await bot.getChat(tops[i].id);
                txt += `${i+1}. ${chat.first_name}: ${tops[i].points} ${d.p}\n`;
            } catch { txt += `${i+1}. لاعب: ${tops[i].points} ${d.p}\n`; }
        }
        bot.editMessageText(txt, {chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [[{text: '🔙 رجوع', callback_data: 'back'}]]}
        });
    }

    if (data === 'shop') {
        bot.editMessageText(`🛒 ${d.s} الإمبراطورية ♾️\n\n1. طاقة لا نهائية 24سا - 2000 ${d.p}\n2. مضاعف x5 نقاط 12سا - 3000 ${d.p}\n3. لقب إمبراطور - 2500 ${d.p}\n4. فتح لعبة البوس - 3000 ${d.p}\n5. سكن ذهبي - 4000 ${d.p}\n\nرصيدك: ${u.points} ${d.p}`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [
                [{text: '⚡ لا نهائي 24سا', callback_data: 'buy_energy_inf'}],
                [{text: 'x5 نقاط', callback_data: 'buy_mult'}],
                [{text: 'لقب إمبراطور', callback_data: 'buy_title'}],
                [{text: '🔙 رجوع', callback_data: 'back'}]
            ]}
        });
    }

    if (data === 'energy') {
        bot.editMessageText(`⚡ ${d.e}: ${u.energy}/1000\n\nتجدد 50 ${d.e} كل ساعة\nأو اشتري من المتجر:`, {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            reply_markup: {inline_keyboard: [
                [{text: '+200 طاقة = 500 نقطة', callback_data: 'buy_e200'}],
                [{text: '+1000 طاقة = 2000 نقطة', callback_data: 'buy_e1000'}],
                [{text: '🔙 رجوع', callback_data: 'back'}]
            ]}
        });
    }

    if (data === 'buy_e200' && u.points >= 500) {
        await db.from('players').update({points: u.points - 500, energy: Math.min(1000, u.energy + 200)}).eq('id', id);
        bot.answerCallbackQuery(q.id, {text: '+200 طاقة ♾️'});
        menu(q.message.chat.id, `${d.e}: ${Math.min(1000, u.energy + 200)}/1000`, u);
    }

    if (data === 'buy_e1000' && u.points >= 2000) {
        await db.from('players').update({points: u.points - 2000, energy: 1000}).eq('id', id);
        bot.answerCallbackQuery(q.id, {text: 'طاقة كاملة ♾️'});
        menu(q.message.chat.id, `${d.e}: 1000/1000`, u);
    }

    if (data === 'back') menu(q.message.chat.id, null, u);
});

// استقبال قنوات
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('@') &&!msg.text.includes(' ')) {
        const {count} = await db.from('sponsors').select('*', {count: 'exact'}).eq('is_free', true);
        if (count < 50) {
            await db.from('sponsors').insert({
                username: msg.text, owner_id: msg.from.id,
                tier: 'free', priority: 50, is_free: true,
                target_joins: 1000, points_price: 0
            });
            bot.sendMessage(msg.chat.id, `🔥🔥 تم قبول ${msg.text} مجانا ♾️\nضمن أول 50 قناة\n1000 عضو جايينك 🚀`);
        }
    }
});

console.log('Dandlioni 10A Infinity V5 شغال ♾️👊');
