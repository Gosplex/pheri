import asyncio, json
from playwright.async_api import async_playwright
URL='http://localhost:8095/'
async def boot(b, name):
    pg = await b.new_page(viewport={'width':1100,'height':650})
    pg.errs=[]; pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: pg.errs.append(m.text) if m.type=='error' else None)
    await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'low'})); localStorage.setItem('pheri-name', '%s')" % name)
    await pg.goto(URL)
    for i in range(90):
        await asyncio.sleep(1)
        if await pg.evaluate("!!window.__game && window.__game.state==='menu'"): break
    return pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        A = await boot(b, 'Hardik'); B = await boot(b, 'Riya')
        await A.evaluate("window.__game.menuAction('online')"); await asyncio.sleep(1)
        await A.screenshot(path='/tmp/mp_home.png')
        await A.evaluate("window.__game.onlineUI._homeAction('create')"); await asyncio.sleep(3)
        code = await A.evaluate("window.__game.match.room && window.__game.match.room.code")
        print('room code', code)
        await B.evaluate("window.__game.menuAction('online')"); await asyncio.sleep(1)
        await B.evaluate(f"document.getElementById('join-code').value='{code}'; window.__game.onlineUI._homeAction('join')"); await asyncio.sleep(3)
        await A.evaluate("window.__game.net.send({type:'settings', settings:{mode:'rush', minutes:3, time:18}})"); await asyncio.sleep(1)
        await A.screenshot(path='/tmp/mp_lobby.png')
        print('players', await A.evaluate("window.__game.match.room.players.map(p=>p.name)"))
        await A.evaluate("window.__game.net.send({type:'start'})"); await asyncio.sleep(5.5)
        for pg in (A, B):
            await pg.evaluate("(()=>{const g=window.__game; g.input.setTouch('throttle', true); g.simulate(3); g.input.setTouch('throttle', false);})()")
        await asyncio.sleep(1.5)
        st = await A.evaluate("(()=>{const g=window.__game, m=g.match; return {state:m.room.state, offers:m.offers.length, remotes:[...m.remotes.values()].map(r=>[r.info.name, +r.x.toFixed(1), +r.z.toFixed(1)]), board:m.board.map(r=>r.name), me:[+g.bike.pos.x.toFixed(1), +g.bike.pos.z.toFixed(1)]}})()")
        print('A sees', json.dumps(st))
        # accept a job from the phone and check the HUD job card is driven by the server
        await A.evaluate("(()=>{const g=window.__game; g.acceptJob(g.match.offers[0].id)})()"); await asyncio.sleep(1)
        print('A job', await A.evaluate("(()=>{const j=window.__game.missions.active; return j && [j.stage, j.from.name, j.pay]})()"))
        # put A behind B to screenshot the remote rider and name tag
        await A.evaluate("(()=>{const g=window.__game; const r=[...g.match.remotes.values()][0]; g.debugCam=true; g.camera.position.set(r.x-5, 2.6, r.z+5); g.camera.lookAt(r.x, 1, r.z);})()")
        await asyncio.sleep(1.5); await A.screenshot(path='/tmp/mp_play.png')
        await A.evaluate("window.__game.debugCam=false")
        await A.evaluate("window.__game.net.send({type:'chat', q:0})"); await asyncio.sleep(0.6)
        await A.evaluate("window.__game.net.send({type:'debugEnd'})"); await asyncio.sleep(2.5)
        await B.screenshot(path='/tmp/mp_results.png')
        print('B results', await B.evaluate("window.__game.match.results && window.__game.match.results.rows.map(r=>[r.rank,r.name,r.deliveries])"))
        print('errors A', A.errs[:6]); print('errors B', B.errs[:6])
        await b.close()
asyncio.run(main())
