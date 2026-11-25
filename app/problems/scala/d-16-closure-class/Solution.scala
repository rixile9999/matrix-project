class Counter(step: Int) extends Function0[Int]:
  private var n = 0
  def apply(): Int =
    n += step
    n

def makeCounter(step: Int): Function0[Int] = new Counter(step)
