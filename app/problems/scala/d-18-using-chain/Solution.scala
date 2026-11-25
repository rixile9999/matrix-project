trait Show[A]:
  def show(a: A): String

given intShow: Show[Int] with
  def show(a: Int): String = a.toString

given listShow[A](using s: Show[A]): Show[List[A]] with
  def show(xs: List[A]): String = xs.map(s.show).mkString("[", ", ", "]")

def render[A](a: A)(using s: Show[A]): String =
  s.show(a)

val nested: Show[List[List[Int]]] =
  listShow(using listShow(using intShow))
