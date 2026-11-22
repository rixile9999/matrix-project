def filterViaFlatMap[A](as: List[A])(f: A => Boolean): List[A] =
  flatMap(as)(a => if f(a) then List(a) else Nil)
