def sequence[A](xs: List[Option[A]]): Option[List[A]] =
  xs.foldRight(Some(Nil): Option[List[A]])((oa, acc) => map2(oa, acc)(_ :: _))
