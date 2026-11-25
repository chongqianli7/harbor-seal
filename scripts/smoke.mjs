import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const site = 'chongqianli7/harbor-seal'
const target = (process.env.HARBOR_URL || 'https://chongqianli7.github.io/harbor-seal/') + '#site=' + encodeURIComponent(site)
const browser = await chromium.launch({channel:process.env.HARBOR_CHROME_CHANNEL || undefined})
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({viewport:{width,height:900}, isMobile:width < 500, hasTouch:width < 500})
    await page.goto(target, {waitUntil:'domcontentloaded'})
    await page.locator('#record .status').filter({hasText:/^(Active|Expired) seal$/}).waitFor({timeout:60000})
    assert.equal(await page.locator('#journal li').count(), 7)
    assert.equal(await page.getByRole('link', {name:'Finalized receipt'}).count(), 7)
    await page.getByText('Valid until', {exact:true}).waitFor()
    const seal = page.getByRole('button', {name:'Rotate the stewardship seal'})
    const angle = await seal.evaluate(el=>el.style.getPropertyValue('--ry'))
    await seal.focus()
    await page.keyboard.press('ArrowRight')
    assert.notEqual(await seal.evaluate(el=>el.style.getPropertyValue('--ry')), angle)
    if (width === 1440) {
      const rect = await seal.boundingBox()
      const prior = await seal.evaluate(el=>el.style.getPropertyValue('--ry'))
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + rect.width / 2 + 65, rect.y + rect.height / 2 - 25, {steps:4})
      await page.mouse.up()
      assert.notEqual(await seal.evaluate(el=>el.style.getPropertyValue('--ry')), prior)
    }
    await page.getByRole('button',{name:'Inspect this revision'}).last().click()
    await page.locator('#seal-state').filter({hasText:'Journal #1'}).waitFor()
    await page.getByRole('button',{name:'Return to current seal'}).click()
    const viewport = await page.evaluate(() => {
      const {clientWidth, scrollWidth} = document.documentElement
      return {clientWidth, scrollWidth}
    })
    assert.equal(viewport.scrollWidth, viewport.clientWidth, `Horizontal overflow at ${width}px`)
    await page.getByRole('button', {name:'Create test wallet'}).click()
    const first = await page.locator('#wallets code').innerText()
    await page.getByRole('button', {name:'Create test wallet'}).click()
    const second = await page.locator('#wallets code').innerText()
    assert.notEqual(first, second)
    await page.getByText('Only the current steward or nominated successor', {exact:false}).waitFor()
    await page.reload()
    await page.locator('#record .status').filter({hasText:/^(Active|Expired) seal$/}).waitFor()
    assert.equal(await page.getByLabel('Active test wallet').count(), 0)
    await page.close()
    console.log(`Verified public record, receipt links, wallet isolation and reload at ${width}px`)
  }
} finally {
  await browser.close()
}
