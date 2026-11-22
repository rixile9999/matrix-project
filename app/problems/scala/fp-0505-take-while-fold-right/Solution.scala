import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def takeWhile(p: A => Boolean): Stream[A] =
    s.foldRight(Stream.empty[A])((a, b) => if p(a) then Stream.cons(a, b) else Stream.empty)

  def headOption: Option[A] =
    s.foldRight(None: Option[A])((a, _) => Some(a))
