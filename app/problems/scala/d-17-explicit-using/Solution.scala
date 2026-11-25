def biggest[A](xs: List[A])(using ord: Ordering[A]): Option[A] =
  xs.reduceOption((a, b) => if ord.gteq(a, b) then a else b)

def smallest[A](xs: List[A])(using ord: Ordering[A]): Option[A] =
  biggest(xs)(using ord.reverse)
