import scala.annotation.tailrec

def fib(n: Int): Int =
  @tailrec
  def go(k: Int, a: Int, b: Int): Int =
    if k == 0 then a else go(k - 1, b, a + b)
  go(n, 0, 1)
