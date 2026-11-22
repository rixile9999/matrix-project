def concat[A](ll: List[List[A]]): List[A] =
  foldRight(ll, Nil: List[A])(append)
