def foldLeftViaFoldRight[A, B](as: List[A], z: B)(f: (B, A) => B): B =
  foldRight(as, (b: B) => b)((a, g) => b => g(f(b, a)))(z)

def foldRightViaFoldLeft[A, B](as: List[A], z: B)(f: (A, B) => B): B =
  foldLeft(as, (b: B) => b)((g, a) => b => g(f(a, b)))(z)
