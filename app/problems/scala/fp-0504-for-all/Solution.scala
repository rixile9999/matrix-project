import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def forAll(p: A => Boolean): Boolean = s match
    case Cons(h, t) => p(h()) && t().forAll(p)
    case Empty => true
