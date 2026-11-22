import scala.annotation.tailrec

def sumTo(n: Int): Int =
  @tailrec def go(i: Int, acc: Int): Int =
    if i > n then acc else go(i + 1, acc + i)
  go(1, 0)
