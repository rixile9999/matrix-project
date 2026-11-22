import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def take(n: Int): Stream[A] = s match
    case Cons(h, t) if n > 1 => Stream.cons(h(), t().take(n - 1))
    case Cons(h, _) if n == 1 => Stream.cons(h(), Stream.empty)
    case _ => Stream.empty

  def drop(n: Int): Stream[A] = s match
    case Cons(_, t) if n > 0 => t().drop(n - 1)
    case _ => s
