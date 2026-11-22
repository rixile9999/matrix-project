import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def toList: List[A] = s match
    case Cons(h, t) => h() :: t().toList
    case Empty => Nil
