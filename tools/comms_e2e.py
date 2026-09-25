# Two-browser test of live chat, voice/video room settings and Agora token issuing.
# Start the server first:  PORT=8093 AGORA_APP_ID=... AGORA_APP_CERTIFICATE=... npm start
import asyncio
from playwright.async_api import async_playwright
URL='http://localhost:8093/'
CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
async def boot(b, name):
    pg = await b.new_page(viewport={'width':1200,'height':700})
    pg.errs=[]; pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'low'})); localStorage.setItem('pheri-name', '%s')" % name)
    await pg.goto(URL)
    for i in range(90):
        await asyncio.sleep(1)
        if await pg.evaluate("!!window.__game && window.__game.state==='menu'"): break
    return pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
        A = await boot(b, 'Hardik'); B = await boot(b, 'Riya')
        await A.evaluate("window.__game.menuAction('online')"); await asyncio.sleep(1)
        await A.evaluate("window.__game.onlineUI._homeAction('create')"); await asyncio.sleep(3)
        code = await A.evaluate("window.__game.match.room.code")
        await B.evaluate("window.__game.menuAction('online')"); await asyncio.sleep(1)
        await B.evaluate(f"document.getElementById('join-code').value='{code}'; window.__game.onlineUI._homeAction('join')"); await asyncio.sleep(3)
        await A.evaluate("window.__game.net.send({type:'settings', settings:{voice:'proximity', video:true}})"); await asyncio.sleep(1.5)
        print('settings', await B.evaluate("JSON.stringify({v:window.__game.match.room.settings.voice, vid:window.__game.match.room.settings.video, text:window.__game.match.room.settings.textChat, rtc:window.__game.match.room.rtc})"))
        await A.click('#chat-input'); await A.keyboard.type('Kem cho Riya, ready for the race?'); await A.keyboard.press('Enter'); await asyncio.sleep(1)
        await B.evaluate("window.__game.net.send({type:'chat', q:1})"); await asyncio.sleep(1)
        print('B chat log:', await B.evaluate("[...document.querySelectorAll('#chat-log .cm')].map(e=>e.textContent)"))
        print('A bike speed after typing (should be 0):', await A.evaluate("window.__game.bike.speed.toFixed(2)"))
        tok = await A.evaluate("window.__game.comms._token().then(t=>({ch:t.channel, uid:t.uid, len:t.token.length, appId:!!t.appId})).catch(e=>'ERR '+e.message)")
        print('rtc token', tok)
        await A.evaluate("localStorage.setItem('pheri-rtc-consent-v1','1'); window.__game.comms.joinVoice()"); await asyncio.sleep(19)
        print('voice joined?', await A.evaluate("window.__game.comms.voice.joined"), '| last toast:', await A.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).slice(-1)[0]"))
        await A.screenshot(path='/tmp/comms_lobby.png')
        await A.evaluate("window.__game.net.send({type:'start'})"); await asyncio.sleep(5.5)
        await A.evaluate("window.__game.simulate(1)"); await asyncio.sleep(3)
        await A.screenshot(path='/tmp/comms_match.png')
        print('errors A', A.errs[:5], 'B', B.errs[:5])
        await b.close()
asyncio.run(main())
