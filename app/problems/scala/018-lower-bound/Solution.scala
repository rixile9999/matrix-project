import scala.annotation.tailrec

def lowerBound(v: Vector[Int], target: Int): Int =
  @tailrec def go(lo: Int, hi: Int): Int =
    if lo >= hi then lo
    else
      val mid = lo + (hi - lo) / 2
      if v(mid) < target then go(mid + 1, hi) else go(lo, mid)
  go(0, v.length)
