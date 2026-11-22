def traverse[E, A, B](xs: List[A])(f: A => Either[E, B]): Either[E, List[B]] =
  xs.foldRight(Right(Nil): Either[E, List[B]])((a, acc) => f(a).map2(acc)(_ :: _))

def sequence[E, A](xs: List[Either[E, A]]): Either[E, List[A]] =
  traverse(xs)(identity)
