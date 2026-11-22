import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def map[B](f: A => B): Stream[B] =
    s.foldRight(Stream.empty[B])((a, b) => Stream.cons(f(a), b))

  def filter(p: A => Boolean): Stream[A] =
    s.foldRight(Stream.empty[A])((a, b) => if p(a) then Stream.cons(a, b) else b)

  def append[B >: A](s2: => Stream[B]): Stream[B] =
    s.foldRight(s2)((a, b) => Stream.cons(a, b))

  def flatMap[B](f: A => Stream[B]): Stream[B] =
    s.foldRight(Stream.empty[B])((a, b) => f(a).append(b))
