def length[A](l: List[A]): Int =
  foldRight(l, 0)((_, n) => n + 1)
