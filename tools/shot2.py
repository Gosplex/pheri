import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        logs=[]
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'medium', showFps:true}))")
        await pg.goto('http://localhost:4173/')
        for i in range(90):
            await asyncio.sleep(1)
            if await pg.evaluate("!document.getElementById('menu').classList.contains('hidden')"): break
        await pg.click('button[data-act=new]')
        await asyncio.sleep(2)
        # open phone (tutorial offer triggers at step 1)
        await pg.evaluate("window.__game._tutorial(1)")
        await pg.keyboard.press('KeyP'); await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/s_phone.png')
        await pg.click('button[data-accept]'); await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/s_job.png')
        await pg.keyboard.press('KeyM'); await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/s_map.png')
        await pg.keyboard.press('KeyM'); await asyncio.sleep(0.5)
        # teleport to bazaar at night
        await pg.evaluate("(()=>{const g=window.__game; const n=g.world.net.nodes.get('mk_-300_-160'); g.bike.place(n.x+30, n.z+2, -Math.PI/2); g.env.time=20.5; g.cam.pos.set(0,0,0);})()")
        await asyncio.sleep(4)
        await pg.screenshot(path='/tmp/s_night.png')
        await pg.evaluate("(()=>{const g=window.__game; const n=g.world.net.nodes.get('rS'); g.bike.place(n.x-5, n.z+40, Math.PI); g.env.time=11; g.env.setWeatherMode('rain'); g.env.rain=1; g.env.cloud=1; g.env.wet=1; g.cam.pos.set(0,0,0);})()")
        await asyncio.sleep(4)
        await pg.screenshot(path='/tmp/s_rain.png')
        await pg.evaluate("(()=>{const g=window.__game; const n=g.world.net.nodes.get('ol_2_1'); g.bike.place(n.x, n.z+15, Math.PI); g.env.time=9; g.env.setWeatherMode('clear'); g.env.rain=0; g.env.cloud=0; g.env.wet=0; g.cam.pos.set(0,0,0);})()")
        await asyncio.sleep(4)
        await pg.screenshot(path='/tmp/s_old.png')
        info = await pg.evaluate("(()=>{const g=window.__game; return {calls:g.renderer.info.render.calls, tris:g.renderer.info.render.triangles, fps:document.getElementById('fps').textContent, veh:g.traffic.vehicles.length, peds:g.peds.peds.length, job:!!g.missions.active}})()")
        print(json.dumps(info))
        print('\n'.join(logs[-30:]))
        await b.close()
asyncio.run(main())
