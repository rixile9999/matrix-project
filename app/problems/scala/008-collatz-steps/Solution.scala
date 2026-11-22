import scala.annotation.tailrec

def collatzSteps(n: Long): Int =
  @tailrec def go(x: Long, steps: Int): Int =
    if x == 1 then steps
    else go(if x % 2 == 0 then x / 2 else 3 * x + 1, steps + 1)
  go(n, 0)
