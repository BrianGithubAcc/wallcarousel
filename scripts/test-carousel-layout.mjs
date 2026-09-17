import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { boundsOverlap, projectCardBounds } from '../src/components/Carousel/cardLayout.ts'

function createCamera(aspect) {
  const camera = new PerspectiveCamera(42, aspect, 0.1, 1000)
  camera.position.set(0, 1.2, 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

function cardAt(x, y, z, quaternion = new Quaternion()) {
  return {
    position: new Vector3(x, y, z),
    quaternion,
  }
}

function visibleBounds(cards, camera) {
  return cards
    .map((card) => projectCardBounds(card, camera, 1))
    .filter((bounds) => bounds !== null)
}

for (const aspect of [0.8, 16 / 9, 3.5]) {
  test(`spaced cards do not overlap at aspect ${aspect}`, () => {
    const camera = createCamera(aspect)
    const bounds = visibleBounds(
      [-5, 0, 5].map((x) => cardAt(x, 0, 0)),
      camera,
    )

    for (let first = 0; first < bounds.length; first += 1) {
      for (let second = first + 1; second < bounds.length; second += 1) {
        assert.equal(boundsOverlap(bounds[first], bounds[second]), false)
      }
    }
  })
}

test('perspective makes a distant card project smaller', () => {
  const camera = createCamera(16 / 9)
  const near = projectCardBounds(cardAt(0, 0, 4), camera, 1)
  const far = projectCardBounds(cardAt(0, 0, -4), camera, 1)

  assert.ok(near)
  assert.ok(far)
  assert.ok(near.right - near.left > far.right - far.left)
  assert.ok(near.top - near.bottom > far.top - far.bottom)
})
