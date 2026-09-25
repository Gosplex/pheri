import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        logs=[]
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.add_init_script("localStorage.setItem('rajkot-rider-settings-v1', JSON.stringify({quality:'medium'}))")
        await pg.goto('http://localhost:4173/')
        for i in range(90):
            await asyncio.sleep(1)
            if await pg.evaluate("!document.getElementById('menu').classList.contains('hidden')"): break
        await pg.click('button[data-act=new]'); await asyncio.sleep(1)
        q="(()=>{const g=window.__game;return {p:[+g.bike.pos.x.toFixed(1),+g.bike.pos.z.toFixed(1)],h:+g.bike.heading.toFixed(2),kmh:+g.bike.kmh.toFixed(1),gear:g.bike.gear,fuel:+g.bike.fuel.toFixed(2), money:Math.round(g.profile.money), rating:g.profile.rating, job:g.missions.active&&g.missions.active.stage, veh:g.traffic.vehicles.length, peds:g.peds.peds.length, time:+g.env.time.toFixed(2)}})()"
        # hold throttle via touch api, simulate 5s
        await pg.evaluate("window.__game.input.setTouch('throttle', true)")
        for i in range(4):
            await pg.evaluate("window.__game.simulate(1.5)"); print(await pg.evaluate(q))
        await pg.evaluate("window.__game.input.setTouch('throttle', false)")
        await pg.evaluate("window.__game.simulate(3)"); print('coast', await pg.evaluate(q))
        await pg.screenshot(path='/tmp/m_after_ride.png')
        await pg.evaluate("window.__game._tutorial(1)")
        await pg.evaluate("(()=>{const g=window.__game; g.acceptJob(g.missions.offers[0].id); })()")
        await pg.evaluate("(()=>{const g=window.__game; const j=g.missions.active; g.bike.place(j.from.x, j.from.z, 0); g.simulate(2)})()")
        print('after pickup', await pg.evaluate(q))
        await pg.evaluate("(()=>{const g=window.__game; const j=g.missions.active; g.bike.place(j.to.x, j.to.z, 0); g.simulate(9)})()")
        print('after drop', await pg.evaluate(q))
        await pg.evaluate("(()=>{const g=window.__game; const f=g.world.props.fuelZones[0]; g.bike.fuel=40; g.bike.place(f.x+2, f.z+2, Math.PI); g.cam.yaw=Math.PI; g.env.time=19.7; g.simulate(0.5); g.input.pressed.add('interact'); g.simulate(5)})()")
        print('after refuel', await pg.evaluate(q))
        await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/m_fuel.png')
        await pg.evaluate("(()=>{const g=window.__game; g.bike.place(40, -266, -Math.PI/2); g.cam.yaw=-Math.PI/2; g.env.time=21; g.input.setTouch('throttle', true); g.simulate(4); g.input.setTouch('throttle', false);})()")
        await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/m_night.png')
        print('night', await pg.evaluate(q))
        # passenger job
        await pg.evaluate("(()=>{const g=window.__game; g.env.time=17.5; const o=g.missions.makeOffer(17.5,g.bike.pos.x,g.bike.pos.z,'passenger'); g.missions.offers.push(o); g.acceptJob(o.id); const j=g.missions.active; g.bike.place(j.from.x, j.from.z, 0); g.simulate(2);})()")
        await asyncio.sleep(1.5)
        await pg.screenshot(path='/tmp/m_pass.png')
        print('passenger', await pg.evaluate(q))
        # long sim to catch runtime errors across a day, including events
        await pg.evaluate("(()=>{const g=window.__game; g.events.timer=0; g.input.setTouch('throttle', true); g.simulate(60); g.events.trigger('baraat', g.bike); g.events.trigger('works', g.bike); g.events.trigger('cow', g.bike); g.events.trigger('jam', g.bike); g.simulate(60); g.input.setTouch('throttle', false);})()")
        print('long', await pg.evaluate(q))
        print('\n'.join(logs[-20:]))
        await b.close()
asyncio.run(main())
