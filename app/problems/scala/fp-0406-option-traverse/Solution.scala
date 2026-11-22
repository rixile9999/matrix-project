def traverse[A, B](xs: List[A])(f: A => Option[B]): Option[List[B]] =
  xs.foldRight(Some(Nil): Option[List[B]])((a, acc) => map2(f(a), acc)(_ :: _))

def sequence[A](xs: List[Option[A]]): Option[List[A]] =
  traverse(xs)(identity)
