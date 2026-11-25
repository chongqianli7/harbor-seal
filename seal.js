const orbit = document.querySelector('#seal-orbit')
const model = orbit.querySelector('.seal-model')
const output = document.querySelector('#seal-state')
const media = matchMedia('(prefers-reduced-motion: reduce)')
let angle = -30
let tilt = 15
let start
for (let index = 0; index < 48; index++) {
  const facet = document.createElement('span')
  facet.className = 'seal-facet'
  facet.style.setProperty('--facet-angle', index * 7.5 + 'deg')
  model.append(facet)
}

function orient() {
  orbit.style.setProperty('--ry', angle + 'deg')
  orbit.style.setProperty('--rx', tilt + 'deg')
}
orbit.addEventListener('pointerdown', event => {
  start = {x:event.clientX,y:event.clientY,angle,tilt}
  orbit.setPointerCapture(event.pointerId)
  orbit.classList.add('dragging')
})
orbit.addEventListener('pointermove', event => {
  if (!start) return
  angle = start.angle + (event.clientX - start.x) * 0.8
  tilt = Math.max(-65, Math.min(65, start.tilt - (event.clientY - start.y) * 0.5))
  orient()
})
for (const type of ['pointerup','pointercancel']) orbit.addEventListener(type, () => {
  start = undefined
  orbit.classList.remove('dragging')
})
orbit.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'ArrowLeft') angle -= 20
  if (event.key === 'ArrowRight') angle += 20
  if (event.key === 'ArrowUp') tilt = Math.min(65,tilt+12)
  if (event.key === 'ArrowDown') tilt = Math.max(-65,tilt-12)
  orient()
})
orbit.addEventListener('click', event => {
  if (!event.detail) { angle += 40; orient() }
})
let scheduled = false
window.addEventListener('scroll', () => {
  if (media.matches || scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    orbit.style.setProperty('--scroll-turn', Math.min(180, window.scrollY * 0.18) + 'deg')
    scheduled = false
  })
}, {passive:true})
orient()

export function setSealState(state, text) {
  orbit.dataset.state = state
  output.textContent = text
}
