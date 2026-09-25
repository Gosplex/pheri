import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'medium', weather:'clear'}))")
        await pg.goto('http://localhost:4176/')
        await asyncio.sleep(2.5); await pg.screenshot(path='/tmp/u_load.png')
        for i in range(90):
            await asyncio.sleep(1)
            if await pg.evaluate("!document.getElementById('menu').classList.contains('hidden')"): break
        await asyncio.sleep(2); await pg.screenshot(path='/tmp/u_menu.png')
        await pg.click("button[data-act=new]"); await asyncio.sleep(6)
        await pg.evaluate("(()=>{const g=window.__game; g._tutorial(1); g.acceptJob(g.missions.offers[0].id); g.profile.money+=120; g.simulate(0.5)})()")
        await asyncio.sleep(4); await pg.screenshot(path="/tmp/u_hud.png")
        await pg.keyboard.press('KeyP'); await asyncio.sleep(4); await pg.screenshot(path="/tmp/u_phone.png")
        await pg.keyboard.press('KeyP'); await asyncio.sleep(3)
        await pg.keyboard.press("Escape"); await asyncio.sleep(4); await pg.screenshot(path='/tmp/u_pause.png')
        await pg.click('.modal-x'); await asyncio.sleep(0.5)
        print('state after X', await pg.evaluate("window.__game.state"))
        print(errs[:5])
        await b.close()
asyncio.run(main())
