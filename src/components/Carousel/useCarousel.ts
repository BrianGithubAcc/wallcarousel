import {
  useCallback,
  useRef,
} from 'react'

export interface CarouselState {
  positionRef: React.RefObject<number>
  next: () => void
  previous: () => void
  goTo: (index: number) => void
  scroll: (amount: number) => void
}

export function useCarousel(
  itemCount: number,
): CarouselState {
  const maxPosition =
    Math.max(0, itemCount - 1)

  /*
   * Current position is what Three.js renders.
   */
  const positionRef =
    useRef(0)

  /*
   * Target position is where the carousel
   * wants to end up.
   */
  const targetRef =
    useRef(0)

  /*
   * How quickly current position follows
   * the target.
   *
   * 0.04 = very floaty
   * 0.08 = smooth
   * 0.15 = responsive
   */
  const SMOOTHING = 0.075

  /*
   * Start one animation loop for the carousel.
   *
   * IMPORTANT:
   *
   * There is NO setState here.
   *
   * React is completely outside the animation.
   */
  const animationStarted =
    useRef(false)

  if (!animationStarted.current) {
    animationStarted.current = true

    const animate = () => {
      const current =
        positionRef.current

      const target =
        targetRef.current

      const difference =
        target - current

      /*
       * Exponential interpolation.
       *
       * This feels much smoother than adding a
       * fixed amount every frame.
       */
      positionRef.current =
        current +
        difference *
        SMOOTHING

      requestAnimationFrame(
        animate,
      )
    }

    requestAnimationFrame(
      animate,
    )
  }

  const scroll = useCallback(
    (amount: number) => {
      targetRef.current =
        Math.max(
          0,
          Math.min(
            targetRef.current + amount,
            maxPosition,
          ),
        )
    },
    [maxPosition],
  )

  const next = useCallback(() => {
    targetRef.current =
      Math.min(
        targetRef.current + 1,
        maxPosition,
      )
  }, [maxPosition])

  const previous = useCallback(() => {
    targetRef.current =
      Math.max(
        targetRef.current - 1,
        0,
      )
  }, [])

  const goTo = useCallback(
    (index: number) => {
      targetRef.current =
        Math.max(
          0,
          Math.min(
            index,
            maxPosition,
          ),
        )
    },
    [maxPosition],
  )

  return {
    positionRef,
    next,
    previous,
    goTo,
    scroll,
  }
}
