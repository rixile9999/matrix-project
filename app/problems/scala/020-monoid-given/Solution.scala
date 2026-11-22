trait Monoid[A]:
  def empty: A
  def combine(x: A, y: A): A

given intAddition: Monoid[Int] with
  def empty: Int = 0
  def combine(x: Int, y: Int): Int = x + y

given stringConcat: Monoid[String] with
  def empty: String = ""
  def combine(x: String, y: String): String = x + y

def combineAll[A](xs: List[A])(using m: Monoid[A]): A =
  xs.foldLeft(m.empty)(m.combine)
