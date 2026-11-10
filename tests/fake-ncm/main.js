// 测试替身：代替 @neteasecloudmusicapienhanced/api，返回固定数据。歌曲地址指向 127.0.0.1:8124 上的测试音频。
const calls = [];
global.__nepCalls = calls;
const song = (id, name, fee = 0) => ({ id, name, ar: [{ name: '歌手' + id }], al: { name: '专辑', picUrl: 'http://p1.music.126.net/x.jpg' }, dt: 200000, fee, privilege: { st: 0, pl: fee ? 0 : 320000 } });
const rec = (name) => (q) => { calls.push({ name, q }); require('fs').appendFileSync(process.env.NEP_CALLS || '/dev/null', JSON.stringify({ name, realIP: q.realIP, cookie: q.cookie, key: q.key }) + '\n'); };
let qrChecks = 0;
// 歌单版本：测试往 NEP_FAKE_STATE 文件里写 1/2/3，「我喜欢的音乐」就有 3/4/5 首，模拟在网易云 App 里加了歌
const plVersion = () => { try { return Number(require('fs').readFileSync(process.env.NEP_FAKE_STATE || '', 'utf8').trim()) || 1; } catch { return 1; } };
// 写大数字（比如 2000）可以模拟大歌单，用来测性能
const plSongs = () => { const base = [song(11, 'A'), song(12, 'B'), song(13, 'C'), song(14, 'D'), song(15, 'E')]; return Array.from({ length: 2 + plVersion() }, (_, i) => base[i] || song(1000 + i, '测试歌曲 ' + i)); };
module.exports = {
  cloudsearch: async (q) => { rec('cloudsearch')(q); return { body: { code: 200, result: { songCount: 2, songs: [song(1, '晴天'), song(2, 'VIP歌', 1)] } } }; },
  login_qr_key: async (q) => { rec('login_qr_key')(q); return { body: { code: 200, data: { unikey: 'abc-123' } } }; },
  login_qr_create: async (q) => { rec('login_qr_create')(q); return { body: { code: 200, data: { qrurl: 'https://music.163.com/login?codekey=' + q.key, qrimg: 'data:image/png;base64,iVBORw0KGgo=' } } }; },
  login_qr_check: async (q) => { rec('login_qr_check')(q); qrChecks++; if (qrChecks < 2) return { body: { code: 801, message: '等待扫码' } }; return { body: { code: 803, message: '授权登陆成功', cookie: 'MUSIC_U=secretU; Max-Age=1296000; Expires=Tue, 01 Jan 2030 00:00:00 GMT; Path=/;__csrf=csrf1; Path=/; HTTPOnly' } }; },
  login_status: async (q) => { rec('login_status')(q); return q.cookie && q.cookie.MUSIC_U ? { body: { data: { code: 200, account: { vipType: 11 }, profile: { userId: 99, nickname: '测试用户', avatarUrl: '' } } } } : { body: { data: { code: 200, account: null, profile: null } } }; },
  logout: async (q) => { rec('logout')(q); return { body: { code: 200 } }; },
  user_playlist: async (q) => { rec('user_playlist')(q); return { body: { playlist: [{ id: 500, name: '我喜欢的音乐', coverImgUrl: '', trackCount: plSongs().length, trackUpdateTime: 1700000000000 + plVersion(), specialType: 5, creator: { userId: 99 } }] } }; },
  playlist_track_all: async (q) => { rec('playlist_track_all')(q); const off = Number(q.offset); const s = plSongs().slice(off, off + Number(q.limit)); return { body: { songs: s, privileges: s.map(x => ({ id: x.id, st: 0, pl: 1 })) } }; },
  song_url_v1: async (q) => { rec('song_url_v1')(q); if (q.id === '2') return { body: { data: [{ id: 2, url: null, code: 404 }] } }; if (q.id === '13') throw { status: 460, body: { code: 460, msg: 'Cheating' } }; return { body: { data: [{ id: Number(q.id), url: 'http://127.0.0.1:8124/song' + q.id + '.wav', br: 128000, expi: 1200, freeTrialInfo: null }] } }; },
  recommend_songs: async (q) => { rec('recommend_songs')(q); return { body: { code: 200, data: { dailySongs: [song(21, '每日一'), song(22, '每日二'), song(23, '每日三')] } } }; },
  recommend_resource: async (q) => { rec('recommend_resource')(q); return { body: { code: 200, recommend: [{ id: 700, name: '推荐歌单一', picUrl: '', trackCount: 3, playcount: 1200 }] } }; },
  personalized: async (q) => { rec('personalized')(q); return { body: { code: 200, result: [{ id: 701, name: '公共推荐', picUrl: '', trackCount: 3, playCount: 99 }] } }; },
  toplist_detail: async (q) => { rec('toplist_detail')(q); return { body: { code: 200, list: [{ id: 800, name: '飙升榜', coverImgUrl: '', updateFrequency: '每天更新', tracks: [{ first: 'A', second: '歌手11' }] }, { id: 801, name: '歌手榜', tracks: [] }] } }; },
  likelist: async (q) => { rec('likelist')(q); return { body: { code: 200, ids: [11] } }; },
  like: async (q) => { rec('like')(q); return { body: { code: 200 } }; },
  // 与真实接口包一致：成功和 502（重复）时把整个请求结果再包一层 { status, body, cookie }；512 以外的失败直接返回 body
  playlist_tracks: async (q) => { rec('playlist_tracks')(q); if (q.pid === '404') return { status: 200, body: { code: 404, message: '歌单不存在' } }; return { status: 200, body: { status: 200, body: q.tracks === '11' && q.op === 'add' ? { code: 502, message: '歌单内歌曲重复' } : { code: 200, count: 1 }, cookie: [] } }; },
  song_url: async (q) => { rec('song_url')(q); throw { status: 460, body: { code: 460, msg: 'Cheating' } }; },
};
