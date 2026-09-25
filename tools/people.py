import asyncio
from playwright.async_api import async_playwright
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
        # 1: a crowd showcase: one of each outfit lined up, some walking
        await pg.evaluate("""(()=>{const g=window.__game; g.env.time=10.5; g.debugCam=true;
          const P=g.peds; const x0=160, z0=-615;
          const kinds=['saree','sareeElder','kameez','kurtiJeans','chaniya','schoolgirl','shirt','kurta','kathiyawadi','student','worker','guard','schoolboy'];
          kinds.forEach((k,i)=>{ const p=P._newPed(x0-9+i*1.5, z0, i%3===0?'walk':'idle', {persistent:true, kind:k, speed:0}); p.heading=0; if(i%3===0){p.mode='idle'; p.speed=1.3; p.phase=i;} p.act=['talk','phone','chai','none'][i%4]; });
          g.simulate(0.5);
          g.camera.position.set(x0, 1.7, z0+6.5); g.camera.lookAt(x0, 1.0, z0); g.camera.fov=55; g.camera.updateProjectionMatrix();
        })()""")
        await asyncio.sleep(2.5); await pg.screenshot(path='/tmp/h_lineup.png')
        # 2: street view with traffic in bazaar
        await pg.evaluate("""(()=>{const g=window.__game; const n=g.world.net.nodes.get('m1'); g.bike.place(n.x-4, n.z+30, Math.PI); g.simulate(4);
          const autos=g.traffic.vehicles.filter(v=>v.kind==='auto').sort((a,b)=>Math.hypot(a.x-g.bike.pos.x,a.z-g.bike.pos.z)-Math.hypot(b.x-g.bike.pos.x,b.z-g.bike.pos.z));
          const v=autos[0]; if(v){ const fx=Math.sin(v.heading), fz=Math.cos(v.heading); g.camera.position.set(v.x+fx*4.5+fz*2.8, 1.9, v.z+fz*4.5-fx*2.8); g.camera.lookAt(v.x, 0.9, v.z);} g.__auto = !!v; })()""")
        await asyncio.sleep(2.5); await pg.screenshot(path='/tmp/h_auto.png')
        await pg.evaluate("""(()=>{const g=window.__game; const cars=g.traffic.vehicles.filter(v=>['sedan','hatch','suv'].includes(v.kind)).sort((a,b)=>Math.hypot(a.x-g.bike.pos.x,a.z-g.bike.pos.z)-Math.hypot(b.x-g.bike.pos.x,b.z-g.bike.pos.z));
          const v=cars[0]; if(v){ const fx=Math.sin(v.heading), fz=Math.cos(v.heading); g.camera.position.set(v.x+fx*5.5-fz*3.2, 2.0, v.z+fz*5.5+fx*3.2); g.camera.lookAt(v.x, 0.8, v.z);} })()""")
        await asyncio.sleep(2.5); await pg.screenshot(path='/tmp/h_car.png')
        await pg.evaluate("""(()=>{const g=window.__game; g.debugCam=false; const n=g.world.net.nodes.get('mk_-300_-160'); g.bike.place(n.x+30, n.z+3.5, -Math.PI/2); g.cam.yaw=-Math.PI/2; g.cam.pos.set(0,0,0); g.env.time=11; g.simulate(3);})()""")
        await asyncio.sleep(2.5); await pg.screenshot(path='/tmp/h_street.png')
        print(errs)
        await b.close()
asyncio.run(main())
