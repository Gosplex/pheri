import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':1280,'height':720}, accept_downloads=True)
        pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'medium', weather:'clear'}))")
        await pg.goto('http://localhost:4174/')
        for i in range(90):
            await asyncio.sleep(1)
            if await pg.evaluate("!document.getElementById('menu').classList.contains('hidden')"): break
        await pg.click('button[data-act=new]'); await asyncio.sleep(1)
        q="(()=>{const g=window.__game;return {money:Math.round(g.profile.money), lvl:g.profile.prog.level, xp:g.profile.prog.xp, ach:g.profile.prog.ach, daily:(g.profile.prog.daily||{}).list?.map(c=>c.id+':'+c.count), fest:g.festivals.current, job:g.missions.active&&g.missions.active.stage, radio:g.radio.station}})()"
        # tiffin job end-to-end
        r = await pg.evaluate("""(()=>{const g=window.__game; g.env.time=12; const o=g.missions._tiffin(12,g.bike.pos.x,g.bike.pos.z); if(!o) return 'no tiffin'; g.missions.offers.push(o); g.acceptJob(o.id); const j=g.missions.active;
          g.bike.place(j.from.x,j.from.z,0); g.simulate(1.5); for(let i=0;i<j.drops.length;i++){ const t=g.missions.active; if(!t) break; g.bike.place(t.to.x,t.to.z,0); g.simulate(8);} return 'ok'})()""")
        print('tiffin', r, await pg.evaluate(q))
        # puncture + garage fix
        r = await pg.evaluate("""(()=>{const g=window.__game; g.events.hooks.puncture(); const gp=g.garages[0]; g.bike.place(gp.x,gp.z,0); g.simulate(0.3); g.input.pressed.add('interact'); g.simulate(0.2); return g.bike.puncture})()""")
        print('puncture still?', r)
        # radio + FP camera screenshot in Uttarayan day
        await pg.evaluate("""(()=>{const g=window.__game; g.audio.start(); g.radio.set('garba'); g.applySetting('festival','uttarayan'); g.env.time=11; const n=g.world.net.nodes.get('rrE2'); g.bike.place(n.x-60,n.z+4,-Math.PI/2); g.cam.mode=3; g.simulate(1.5);})()""")
        await asyncio.sleep(2); await pg.screenshot(path='/tmp/f_kites_fp.png')
        # Diwali night
        await pg.evaluate("""(()=>{const g=window.__game; g.cam.mode=0; g.applySetting('festival','diwali'); g.env.time=20.2; const n=g.world.net.nodes.get('mk_-300_-160'); g.bike.place(n.x+30,n.z+3.5,-Math.PI/2); g.cam.yaw=-Math.PI/2; g.cam.pos.set(0,0,0); g.simulate(4);})()""")
        await asyncio.sleep(2); await pg.screenshot(path='/tmp/f_diwali.png')
        # Navratri garba
        await pg.evaluate("""(()=>{const g=window.__game; g.applySetting('festival','navratri'); g.env.time=20.5; g.bike.place(320,425,0); g.cam.yaw=0; g.cam.pos.set(0,0,0); g.simulate(2); g.debugCam=true; g.camera.position.set(300,7,428); g.camera.lookAt(320,1,460);})()""")
        await asyncio.sleep(2); await pg.screenshot(path='/tmp/f_garba.png')
        # photo mode capture
        await pg.evaluate("window.__game.debugCam=false; window.__game.togglePhoto()")
        await asyncio.sleep(1)
        async with pg.expect_download() as dl: await pg.click('#ph-shot')
        d = await dl.value; print('photo', d.suggested_filename)
        await pg.evaluate("window.__game.togglePhoto()")
        # phone profile tab
        await pg.evaluate("(()=>{const g=window.__game; g.env.time=10; g.togglePhone(); g.ui.phoneTab='profile'; g.ui.renderPhone();})()")
        await asyncio.sleep(1.2); await pg.screenshot(path='/tmp/f_profile.png')
        # long sim with events incl power cut
        await pg.evaluate("""(()=>{const g=window.__game; g.togglePhone(); g.env.time=21; g.events.trigger('powercut', g.bike); g.events.trigger('puncture', g.bike); g.input.setTouch('throttle', true); g.simulate(40); g.input.setTouch('throttle', false); g.endShift();})()""")
        print('end', await pg.evaluate(q))
        print('errors', errs[:10])
        await b.close()
asyncio.run(main())
