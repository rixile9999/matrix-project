import Stream.{Cons, Empty}

extension [A](s: Stream[A])
  def tails: Stream[Stream[A]] =
    unfold(s) {
      case Empty => None
      case cur @ Cons(_, t) => Some((cur, t()))
    }.append(Stream(Stream.empty))

  def hasSubsequence(sub: Stream[A]): Boolean =
    s.tails.exists(_.startsWith(sub))
