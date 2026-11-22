import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def scanRight[B](z: B)(f: (A, => B) => B): Stream[B] =
    s.foldRight((z, Stream(z))) { (a, acc) =>
      lazy val cur = acc
      val b = f(a, cur._1)
      (b, Stream.cons(b, cur._2))
    }._2
