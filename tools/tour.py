import asyncio
from playwright.async_api import async_playwright
SHOTS = [
 ('t_bazaar', "const n=g.world.net.nodes.get('mk_-480_-160'); g.bike.place(n.x+40, n.z+2.5, -Math.PI/2); g.env.time=10.5;", -1.5708),
 ('t_gate', "g.bike.place(-40, -597, Math.PI/2); g.env.time=8;", 1.5708),
 ('t_chowk', "g.bike.place(-77, -330, Math.PI); g.env.time=17.8;", 3.1416),
 ('t_khau', "g.bike.place(250, 284, -Math.PI/2); g.env.time=20.3;", -1.5708),
 ('t_hwy', "g.bike.place(-84, -700, Math.PI); g.env.time=13;", 3.1416),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'medium', weather:'clear'}))")
        await pg.goto('http://localhost:4173/')
        for i in range(90):
            await asyncio.sleep(1)
            if await pg.evaluate("!document.getElementById('menu').classList.contains('hidden')"): break
        await pg.click('button[data-act=new]'); await asyncio.sleep(1)
        await pg.evaluate("window.__game.profile.tutorialDone=true")
        for name, js, yaw in SHOTS:
            await pg.evaluate("(()=>{const g=window.__game; %s g.cam.yaw=%f; g.cam.pos.set(0,0,0); g.simulate(1.2);})()" % (js, yaw))
            await asyncio.sleep(2)
            await pg.screenshot(path=f'/tmp/{name}.png')
        print(errs)
        await b.close()
asyncio.run(main())
