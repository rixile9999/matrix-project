import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def takeWhile(p: A => Boolean): Stream[A] = s match
    case Cons(h, t) if p(h()) => Stream.cons(h(), t().takeWhile(p))
    case _ => Stream.empty
