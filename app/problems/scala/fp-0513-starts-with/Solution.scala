import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def startsWith(prefix: Stream[A]): Boolean =
    s.zipAll(prefix).takeWhile(_._2.isDefined).forAll((a, b) => a == b)
