def rebuild[A](l: List[A]): List[A] =
  foldRight(l, Nil: List[A])(Cons(_, _))
